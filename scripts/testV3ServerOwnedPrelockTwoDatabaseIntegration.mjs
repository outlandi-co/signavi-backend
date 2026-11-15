import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import path from "node:path";

import Order from "../models/Order.js";

import {
  getV3SandboxConnection
} from "../utils/v3SandboxDatabaseConnection.js";

import {
  collectV3ServerOwnedPrelockEvidenceReadOnly
} from "../utils/collectV3ServerOwnedPrelockEvidenceReadOnly.js";

const host = "127.0.0.1:27128";

const storeUri =
  `mongodb://${host}/signavi_store?directConnection=true`;

const sandboxUri =
  `mongodb://${host}/signavi_shipping_v3_dev?directConnection=true`;

const expectedData =
  "C:\\Users\\signa\\AppData\\Local\\Signavi\\" +
  "V3Local27128-56d1852f4b8f465c993c6a96985bc02d\\data";

const normalize = value =>
  path.win32.normalize(String(value ?? "").replaceAll("/", "\\"))
    .replace(/\\+$/, "")
    .toLowerCase();

test("real local Store and V3 sandbox isolation", async t => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox");
  assert.equal(process.env.SMART_SHIPPING_V3_ENABLED, "true");

  assert.equal(
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED,
    "false"
  );

  assert.equal(process.env.MONGO_URI, storeUri);
  assert.equal(process.env.V3_SANDBOX_MONGO_URI, sandboxUri);

  let sandbox = null;
  let insertedStore = false;
  let insertedOperation = false;

  const orderId = new mongoose.Types.ObjectId();

  try {
    await mongoose.connect(storeUri, {
      serverSelectionTimeoutMS: 5000
    });

    const admin = mongoose.connection.db.admin();

    const hello = await admin.command({ hello: 1 });
    const options = await admin.command({ getCmdLineOpts: 1 });

    assert.equal(hello.setName, "signaviV3LocalRs");
    assert.equal(hello.isWritablePrimary, true);

    assert.equal(Number(options.parsed?.net?.port), 27128);
    assert.equal(
      options.parsed?.replication?.replSet ??
      options.parsed?.replication?.replSetName,
      "signaviV3LocalRs"
    );

    assert.equal(
      normalize(options.parsed?.storage?.dbPath),
      normalize(expectedData)
    );

    assert.equal(
      mongoose.connection.db.databaseName,
      "signavi_store"
    );

    assert.equal(Order.db, mongoose.connection);

    sandbox = await getV3SandboxConnection();

    assert.notEqual(sandbox, mongoose.connection);
    assert.equal(sandbox.readyState, 1);
    assert.equal(
      sandbox.db.databaseName,
      "signavi_shipping_v3_dev"
    );

    const operations = sandbox.db.collection(
      "smart_shipping_v3_payment_operations"
    );

    const storeDocument = {
      _id: orderId,
      customerName: "Synthetic V3 Test Customer",
      email: `local-test-${orderId}@example.invalid`,
      address: {
        street: "100 Test Street",
        city: "Test City",
        state: "CA",
        zip: "95340",
        country: "US"
      },
      items: [],
      source: "store",
      status: "pending",
      paymentStatus: "unpaid",
      subtotal: 20,
      tax: 2,
      squareExpectedAmountCents: 2700,
      paymentUrl: "",
      squarePaymentLinkId: "",
      squareOrderId: ""
    };

    const operationDocument = {
      orderId,
      environment: "sandbox",
      status: "pending",
      amountCents: 2700,
      requestOwner: "",
      idempotencyKey: `local-test-${orderId}`,
      checkoutReferenceId: `local-ref-${orderId}`,
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: null,
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: ""
    };

    assert.equal(
      await Order.collection.findOne({ _id: orderId }),
      null
    );

    assert.equal(
      await operations.findOne({ orderId }),
      null
    );

    // Raw insertion is deliberate: this stage tests
    // database isolation, not schema-complete checkout.
    await Order.collection.insertOne(storeDocument);
    insertedStore = true;

    await operations.insertOne(operationDocument);
    insertedOperation = true;

    await t.test(
      "Store order is readable through authoritative model",
      async () => {
        const savedOrder = await Order.findById(orderId);

        assert.ok(savedOrder);
        assert.equal(String(savedOrder._id), String(orderId));
        assert.equal(savedOrder.customerName,
          "Synthetic V3 Test Customer");
        assert.equal(Order.db, mongoose.connection);
      }
    );

    await t.test(
      "Store and sandbox records remain separated",
      async () => {
        assert.ok(
          await mongoose.connection.db
            .collection(Order.collection.name)
            .findOne({ _id: orderId })
        );

        assert.equal(
          await sandbox.db
            .collection(Order.collection.name)
            .findOne({ _id: orderId }),
          null
        );

        assert.ok(await operations.findOne({ orderId }));

        assert.equal(
          await mongoose.connection.db
            .collection(
              "smart_shipping_v3_payment_operations"
            )
            .findOne({ orderId }),
          null
        );
      }
    );

    await t.test(
      "Invalid authenticated checkout cannot pass prelock",
      async () => {
        const result =
          await collectV3ServerOwnedPrelockEvidenceReadOnly({
            orderId: String(orderId),
            guestToken: "invalid-local-guest-token",
            signedQuote: "invalid-local-signed-quote"
          });

        assert.equal(result.eligibleForReview, false);
        assert.equal(
          result.reason,
          "SIGNED_STORE_CHECKOUT_NOT_VERIFIED"
        );
        assert.equal(result.squareRequestAuthorized, false);
        assert.equal(result.retryAuthorized, false);
      }
    );

    console.log("REAL_TWO_DATABASE_ISOLATION_VERIFIED");
    console.log("INVALID_CHECKOUT_FAIL_CLOSED");

  } finally {
    try {
      if (
        insertedOperation &&
        sandbox?.readyState === 1 &&
        sandbox.db?.databaseName ===
          "signavi_shipping_v3_dev"
      ) {
        const removed = await sandbox.db
          .collection("smart_shipping_v3_payment_operations")
          .deleteOne({ orderId });

        assert.equal(
          removed.deletedCount,
          1,
          "SANDBOX_FIXTURE_CLEANUP_FAILED"
        );
      }

      if (
        insertedStore &&
        mongoose.connection.readyState === 1 &&
        mongoose.connection.db?.databaseName ===
          "signavi_store"
      ) {
        const removed = await Order.collection.deleteOne({
          _id: orderId
        });

        assert.equal(
          removed.deletedCount,
          1,
          "STORE_FIXTURE_CLEANUP_FAILED"
        );
      }

      console.log("SYNTHETIC_FIXTURE_CLEANUP_COMPLETE");
    } finally {
      if (sandbox) {
        await sandbox.close();
      }
      await mongoose.disconnect();
    }
  }
});
