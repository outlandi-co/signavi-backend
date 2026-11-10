import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Order from "../models/Order.js";
import orderRoutes from "../routes/orders.js";

import { createGuestCheckoutToken } from
  "../utils/guestCheckoutToken.js";
import { createV3OrderFingerprint } from
  "../utils/smartShippingV3OrderFingerprint.js";
import { createV3SignedQuote } from
  "../utils/smartShippingV3QuoteSigning.js";
import { createV3CrossDatabaseCheckoutModels } from
  "../utils/createV3CrossDatabaseCheckoutModels.js";

const settings = [
  "NODE_ENV",
  "SQUARE_ENVIRONMENT",
  "MONGO_URI",
  "SMART_SHIPPING_V3_ENABLED",
  "SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED",
  "SMART_SHIPPING_V3_SANDBOX_HTTP_ENABLED",
  "SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED",
  "SMART_SHIPPING_V3_DURABLE_WORKFLOW_TEST_ENABLED",
  "SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED",
  "SMART_SHIPPING_V3_DURABLE_HTTP_TEST_ENABLED",
  "SMART_SHIPPING_V3_HTTP_LINK_RELEASE_TEST_ENABLED",
  "SHIPPING_QUOTE_SECRET",
  "SHIPPING_V3_QUOTE_SECRET"
];

const saved = new Map(
  settings.map(key => [key, process.env[key]])
);

let replica;
let server;

try {
  delete process.env.MONGO_URI;

  Object.assign(process.env, {
    NODE_ENV: "test",
    SQUARE_ENVIRONMENT: "sandbox",
    SMART_SHIPPING_V3_ENABLED: "true",
    SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED: "true",
    SMART_SHIPPING_V3_SANDBOX_HTTP_ENABLED: "true",
    SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED: "true",
    SMART_SHIPPING_V3_DURABLE_WORKFLOW_TEST_ENABLED: "false",
    SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED: "true",
    SMART_SHIPPING_V3_DURABLE_HTTP_TEST_ENABLED: "true",
    SMART_SHIPPING_V3_HTTP_LINK_RELEASE_TEST_ENABLED: "true",
    SHIPPING_QUOTE_SECRET: crypto.randomBytes(32).toString("hex"),
    SHIPPING_V3_QUOTE_SECRET: crypto.randomBytes(48).toString("hex")
  });

  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  });

  await mongoose.connect(replica.getUri("signavi_store"), {
    serverSelectionTimeoutMS: 10000
  });

  const store = mongoose.connection;
  const sandbox = store.useDb("signavi_shipping_v3_dev", {
    useCache: true
  });

  assert.equal(store.db.databaseName, "signavi_store");
  assert.equal(sandbox.db.databaseName, "signavi_shipping_v3_dev");
  assert.equal(store.getClient(), sandbox.getClient());

  const models = createV3CrossDatabaseCheckoutModels({
    storefrontConnection: store,
    sandboxConnection: sandbox
  });

  await models.SandboxOwnership.createIndexes();
  await models.SandboxPaymentOperation.createIndexes();

  let recordedSquareOrderId = "";
  let recordedPaymentUrl = "";
  let recordedCheckoutReference = "";
  // Test-only Square lookup simulation. No Square SDK requests.
  let evidenceMode = "valid";
  let evidenceReads = 0;

  const app = express();

  app.locals.v3SandboxLinkReleaseTestReaders = {
    expectedLocationId: "mock-location",

    readSquareLink: async ({ paymentLinkId }) => {
      evidenceReads++;

      if (evidenceMode === "unavailable") {
        throw new Error("MOCK_SQUARE_LOOKUP_UNAVAILABLE");
      }

      return {
        paymentLink: {
          id: paymentLinkId,
          orderId: recordedSquareOrderId,
          url: evidenceMode === "mismatch"
            ? "https://square.link/u/incorrect"
            : recordedPaymentUrl
        }
      };
    },

    readSquareOrder: async ({ squareOrderId }) => {
      evidenceReads++;

      return {
        order: {
          id: squareOrderId,
          referenceId: recordedCheckoutReference,
          locationId: "mock-location",
          totalMoney: {
            amount: 5528n,
            currency: "USD"
          }
        }
      };
    }
  };
  app.use(express.json());
  app.use("/api/orders", orderRoutes);

  server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve();
    server.once("listening", resolve);
    server.once("error", reject);
  });

  const base = `http://127.0.0.1:${server.address().port}`;

  const fixture = async () => {
    const orderId = new mongoose.Types.ObjectId();

    await new Order({
      _id: orderId,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      customerName: "HTTP Cross Database Test",
      email: "checkout-test@example.com",
      address: {
        street: "123 Test Street",
        city: "Test City",
        state: "CA",
        zip: "90001",
        country: "US"
      },
      subtotal: 39.98,
      tax: 3.30,
      finalPrice: 43.28,
      items: [{
        productId: new mongoose.Types.ObjectId(),
        quantity: 2,
        finalPrice: 19.99,
        variant: { color: "black", size: "L" }
      }]
    }).save();

    const order = await Order.findById(orderId);

    return {
      orderId,
      token: createGuestCheckoutToken(order),
      quote: createV3SignedQuote({
        cartFingerprint: createV3OrderFingerprint(order),
        shippingAmountCents: 1200,
        parcelRateIds: ["test_rate_1", "test_rate_2"],
        carrier: "USPS",
        serviceToken: "usps_ground_advantage"
      })
    };
  };

  const checkout = async (
    item,
    {
      token = item.token,
      quote = item.quote,
      durable = true
    } = {}
  ) => {
    const response = await fetch(
      `${base}/api/orders/${item.orderId}/checkout`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-signavi-v3-sandbox-mode": "prepare",
          ...(durable ? {
            "x-signavi-v3-sandbox-durable": "prepare"
          } : {}),
          ...(token ? {
            "x-signavi-guest-checkout-token": token
          } : {})
        },
        body: JSON.stringify({ v3ShippingQuote: quote })
      }
    );

    return {
      status: response.status,
      body: await response.json()
    };
  };

  const counts = async item => ({
    operations: await models.SandboxPaymentOperation.countDocuments({
      orderId: item.orderId
    }),
    ownership: await models.SandboxOwnership.countDocuments({
      environment: "sandbox",
      purchaseKey: `order:${item.orderId}`
    }),
    locks: await sandbox.db
      .collection("smart_shipping_v3_checkout_locks")
      .countDocuments({ _id: item.orderId })
  });

  // Ordinary preview must not create durable payment records.
  const previewItem = await fixture();
  const preview = await checkout(previewItem, { durable: false });

  assert.equal(preview.status, 202);
  assert.equal(preview.body.code, "V3_SANDBOX_PREPARED_NO_PAYMENT");
  assert.equal(preview.body.paymentCreated, false);
  assert.equal(preview.body.squareRequestAuthorized, false);

  assert.deepEqual(await counts(previewItem), {
    operations: 0,
    ownership: 0,
    locks: 0
  });

  for (const field of ["paymentUrl", "checkoutUrl", "url"]) {
    assert.ok(
      !preview.body[field],
      `Preview exposed ${field}`
    );
  }
  console.log("PASS: ORDINARY HTTP PREVIEW UNCHANGED");

  // Missing guest ownership must be rejected without writes.
  const missing = await fixture();
  const noToken = await checkout(missing, { token: "" });

  assert.equal(noToken.status, 403);
  assert.equal((await counts(missing)).operations, 0);
  assert.equal((await counts(missing)).ownership, 0);

  console.log("PASS: MISSING GUEST TOKEN BLOCKED");

  // Tampered shipping evidence must not create payment records.
  const tampered = await fixture();
  const invalid = await checkout(tampered, {
    quote: tampered.quote + "tampered"
  });

  assert.equal(invalid.status, 400);
  assert.equal((await counts(tampered)).operations, 0);
  assert.equal((await counts(tampered)).ownership, 0);

  console.log("PASS: INVALID QUOTE BLOCKED");

  // Execute real, test-only durable preparation over HTTP.
  const item = await fixture();
  const response = await checkout(item);

  assert.equal(response.status, 202);
  assert.equal(
    response.body.code,
    "V3_SANDBOX_DURABLE_HTTP_TEST_ONLY"
  );
  assert.equal(response.body.success, true);
  assert.equal(response.body.paymentCreated, false);
  assert.equal(response.body.squareRequestAuthorized, false);
  assert.ok(response.body.paymentOperationId);

  const operation = await models.SandboxPaymentOperation.findOne({
    orderId: item.orderId
  }).lean();

  const ownership = await models.SandboxOwnership.findOne({
    environment: "sandbox",
    purchaseKey: `order:${item.orderId}`
  }).lean();

  const order = await Order.findById(item.orderId).lean();

  assert.ok(operation);
  assert.ok(ownership);
  assert.equal(String(operation._id), response.body.paymentOperationId);
  assert.equal(operation.amountCents, 5528);
  assert.equal(order.squareEnvironment, "sandbox");
  assert.equal(order.squareExpectedAmountCents, 5528);

  assert.deepEqual(await counts(item), {
    operations: 1,
    ownership: 1,
    locks: 0
  });

  for (const field of ["paymentUrl", "checkoutUrl", "url"]) {
    assert.ok(
      !response.body[field],
      `Durable preparation exposed ${field}`
    );
  }

  assert.equal(operation.status, "pending");
  assert.equal(operation.squarePaymentLinkId, "");
  assert.equal(operation.squareOrderId, "");
  assert.equal(operation.paymentUrl, "");

  console.log(
    "PASS: HTTP PREPARATION DOES NOT EXPOSE PAYMENT URL"
  );
  console.log("PASS: HTTP 202 DURABLE CHECKOUT PERSISTED");
  console.log("PASS: STORE AND SANDBOX PAYMENT BINDING");
  console.log("PASS: ISOLATED CHECKOUT LOCK RELEASED");

  // Duplicate request may be rejected at authentication,
  // quote validation or payment-history enforcement.
  // In every case there must be no second payment claim.
  const duplicate = await checkout(item);

  assert.ok(
    duplicate.status >= 400 && duplicate.status < 500,
    `Duplicate checkout was not rejected: ${duplicate.status}`
  );

  assert.equal((await counts(item)).operations, 1);
  assert.equal((await counts(item)).ownership, 1);

  console.log(
    `PASS: DUPLICATE HTTP CHECKOUT BLOCKED (${duplicate.status})`
  );

  // Simulate durably recorded Square-link evidence in the
  // local test database. No Square creation is performed.
  const recordedId = String(item.orderId);

  recordedSquareOrderId = `mock-square-${recordedId}`;
  recordedPaymentUrl = `https://square.link/u/test-${recordedId}`;
  recordedCheckoutReference = `signavi-v3-${recordedId}`;

  const storeUpdate = await models.StoreOrder.collection.updateOne(
    { _id: item.orderId },
    { $set: { currency: "usd" } }
  );

  const operationUpdate =
    await models.SandboxPaymentOperation.collection.updateOne(
      { _id: operation._id },
      {
        $set: {
          status: "completed",
          requestOwner: "trusted-http-test-owner",
          squareCreationAttemptClaimedAt: new Date(),
          squarePaymentLinkId: `mock-link-${recordedId}`,
          squareOrderId: recordedSquareOrderId,
          paymentUrl: recordedPaymentUrl
        }
      }
    );

  const ownershipUpdate =
    await models.SandboxOwnership.collection.updateOne(
      { _id: ownership._id },
      {
        $set: {
          claimedByDocumentType: "order",
          claimedByDocumentId: recordedId
        }
      }
    );

  assert.equal(storeUpdate.matchedCount, 1);
  assert.equal(operationUpdate.matchedCount, 1);
  assert.equal(ownershipUpdate.matchedCount, 1);

  const persistedOperation =
    await models.SandboxPaymentOperation.findById(
      operation._id
    ).lean();

  assert.equal(
    persistedOperation.checkoutReferenceId,
    recordedCheckoutReference
  );

  assert.match(
    String(persistedOperation.idempotencyKey),
    /^signavi-v3-sandbox-[0-9a-f-]{36}$/i
  );

  const fetchRecordedLink = async (token = item.token) => {
    const result = await fetch(
      `${base}/api/orders/v3-test-only/${recordedId}/recorded-link`,
      {
        headers: {
          "x-signavi-guest-checkout-token": token
        }
      }
    );

    return {
      status: result.status,
      body: await result.json()
    };
  };

  // Verified link may be returned to its authenticated owner.
  evidenceMode = "valid";
  evidenceReads = 0;

  const verifiedLink = await fetchRecordedLink();

  assert.equal(verifiedLink.status, 200);
  assert.equal(
    verifiedLink.body.code,
    "V3_TEST_ONLY_VERIFIED_LINK"
  );
  assert.equal(
    verifiedLink.body.paymentUrl,
    recordedPaymentUrl
  );
  assert.equal(verifiedLink.body.customerPaymentConfirmed, false);
  assert.equal(evidenceReads, 2);

  console.log("PASS: VERIFIED HTTP LINK RELEASE");

  // An invalid guest session must never reach Square lookup.
  evidenceReads = 0;

  const unauthorizedLink =
    await fetchRecordedLink("invalid-guest-token");

  assert.equal(unauthorizedLink.status, 403);
  assert.equal(unauthorizedLink.body.paymentUrl, null);
  assert.equal(evidenceReads, 0);

  console.log("PASS: HTTP LINK GUEST OWNERSHIP ENFORCED");

  // Independently mismatched Square evidence must block release.
  evidenceMode = "mismatch";

  const mismatchedLink = await fetchRecordedLink();

  assert.equal(mismatchedLink.status, 409);
  assert.equal(mismatchedLink.body.paymentUrl, null);

  console.log("PASS: HTTP LINK EVIDENCE MISMATCH BLOCKED");

  // Lookup failure must never expose the recorded URL.
  evidenceMode = "unavailable";

  const unavailableLink = await fetchRecordedLink();

  assert.equal(unavailableLink.status, 503);
  assert.equal(unavailableLink.body.paymentUrl, null);

  console.log("PASS: HTTP LINK LOOKUP FAILURE BLOCKED");

  evidenceMode = "valid";
  // Existing production lock must remain authoritative.
  const production = await fixture();
  process.env.SQUARE_ENVIRONMENT = "production";

  try {
    evidenceReads = 0;

    const lockedLink = await fetchRecordedLink();

    assert.equal(lockedLink.status, 423);
    assert.equal(lockedLink.body.paymentUrl, null);
    assert.equal(evidenceReads, 0);

    console.log("PASS: PRODUCTION HTTP LINK RELEASE LOCKED");
    const locked = await checkout(production);
    assert.equal(locked.status, 423);
    assert.equal(locked.body.paymentCreated, false);
    assert.equal(locked.body.squareRequestAuthorized, false);
    assert.equal((await counts(production)).operations, 0);

    console.log("PASS: PRODUCTION HTTP 423 LOCK PRESERVED");
  } finally {
    process.env.SQUARE_ENVIRONMENT = "sandbox";
  }

  console.log("\nCROSS-DATABASE HTTP ACCEPTANCE PASSED");
  console.log("NO SQUARE REQUESTS");

} catch (error) {
  console.error("CROSS-DATABASE HTTP ACCEPTANCE FAILED:", error);
  process.exitCode = 1;

} finally {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }

  await mongoose.disconnect();

  if (replica) {
    await replica.stop();
  }

  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  console.log("PASS: TEST RESOURCES CLEANED UP");
}