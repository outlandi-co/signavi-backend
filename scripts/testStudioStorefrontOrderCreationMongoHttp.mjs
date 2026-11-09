import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  createStorefrontRecoverySecret
} from "../utils/storefrontRecoveryProof.mjs";

process.env.NODE_ENV = "test";
process.env.SMART_SHIPPING_V3_ENABLED = "true";
process.env.SQUARE_ENVIRONMENT = "production";
process.env.SHIPPING_QUOTE_SECRET = randomBytes(32).toString("hex");
process.env.SHIPPING_V3_QUOTE_SECRET = randomBytes(48).toString("hex");

// Do not supply live credentials to this test.
for (const key of [
  "MONGO_URI",
  "MONGODB_URI",
  "V3_SANDBOX_MONGO_URI",
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_TOKEN",
  "SQUARE_PRODUCTION_ACCESS_TOKEN"
]) {
  delete process.env[key];
}

const { default: express } = await import("express");
const { default: mongoose } = await import("mongoose");

let memoryServer;
let server;

const originalFetch = globalThis.fetch;

let externalHttpAttempts = 0;

globalThis.fetch = (input, options) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL
      ? input
      : input.url
  );

  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1"
  ) {
    externalHttpAttempts++;
    throw new Error("TEST_EXTERNAL_HTTP_REQUEST_BLOCKED");
  }

  return originalFetch(input, options);
};

function newId() {
  return new mongoose.Types.ObjectId();
}

function newAttempt() {
  return {
    key: randomUUID(),
    secret: createStorefrontRecoverySecret()
  };
}

function productFixture(storefront) {
  return {
    _id: newId(),
    name: `Integration ${storefront} product`,
    storefront,
    salesChannel: storefront,
    productType: "physical",
    active: true,
    storefrontVisible: true,
    price: 25,
    basePrice: 25,
    listPrice: 25,
    stock: 100,
    quantity: 100,
    variants: [],
    images: []
  };
}

function orderRequest(storefront, product) {
  return {
    storefront,
    customerName: "HTTP Integration Customer",
    email: "integration@example.invalid",
    phone: "5550000000",
    address: {
      street: "123 Test Street",
      city: "Test City",
      state: "CA",
      zip: "95340"
    },
    items: [{
      productId: String(product._id),
      quantity: 1
    }]
  };
}

async function post(base, body, attempt) {
  const response = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signavi-storefront-attempt-key": attempt.key,
      "x-signavi-storefront-recovery-secret": attempt.secret
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

async function startServer(app) {
  return new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1");

    listener.once("listening", () => resolve(listener));
    listener.once("error", reject);
  });
}

function assertSafeCreationResponse(result) {
  assert.equal(
    result.status,
    201,
    `Expected HTTP 201: ${JSON.stringify(result.body).slice(0, 500)}`
  );

  assert.equal(result.body.success, true);

  assert.deepEqual(
    Object.keys(result.body.data).sort(),
    ["_id"]
  );

  assert.match(
    result.body.data._id,
    /^[a-f0-9]{24}$/
  );

  assert.equal(typeof result.body.checkoutToken, "string");
  assert.ok(result.body.checkoutToken.length > 0);
  assert.equal(result.body.checkoutVersion, "v3");

  const responseText = JSON.stringify(result.body);

  for (const field of [
    "storefrontCreationAttemptKey",
    "storefrontCreationFingerprint",
    "storefrontRecoveryProofHash",
    "storefrontRecoveryExpiresAt",
    "v3FirstAttemptProvenanceIssuedAt"
  ]) {
    assert.equal(
      responseText.includes(field),
      false,
      `Private field exposed: ${field}`
    );
  }
}

try {
  memoryServer = await MongoMemoryServer.create({
    instance: {
      ip: "127.0.0.1"
    }
  });

  const memoryUri = memoryServer.getUri();
  const parsed = new URL(memoryUri);

  assert.equal(parsed.protocol, "mongodb:");
  assert.equal(parsed.hostname, "127.0.0.1");

  // Never use an environment-supplied MongoDB URI.
  mongoose.set("autoIndex", false);

  const dbName =
    `signavi_http_creation_${randomBytes(6).toString("hex")}`;

  await mongoose.connect(memoryUri, {
    dbName,
    serverSelectionTimeoutMS: 10000
  });

  assert.equal(mongoose.connection.name, dbName);

  console.log("PASS: Disposable MongoDB connection");

  const { default: Product } =
    await import("../models/Product.js");

  const { default: Order } =
    await import("../models/Order.js");

  const { default: orderRoutes } =
    await import("../routes/orders.js");

  const { verifyGuestCheckoutToken } =
    await import("../utils/guestCheckoutToken.js");

  const {
    verifyStorefrontAttemptIndexReadiness
  } = await import(
    "../utils/verifyStorefrontAttemptIndexReadiness.mjs"
  );

  // All collection operations below use the memory-server
  // Mongoose connection, never a persistent database.
  await Order.createCollection();

  await Order.collection.createIndex(
    { storefrontCreationAttemptKey: 1 },
    {
      name: "unique_storefront_creation_attempt_v1",
      unique: true,
      partialFilterExpression: {
        storefrontCreationAttemptKey: { $type: "string" }
      },
      collation: { locale: "simple" }
    }
  );

  const readiness =
    await verifyStorefrontAttemptIndexReadiness({
      listIndexes: () => Order.collection.indexes()
    });

  assert.equal(readiness.ready, true);

  console.log("PASS: Required unique index ready");

  const studio = productFixture("signavi_studio");
  const store = productFixture("signavi_store");

  await Product.collection.insertMany([studio, store]);

  console.log("PASS: Separate Studio and Store products inserted");

  const app = express();
  app.use(express.json());
  app.use("/api/orders", orderRoutes);

  server = await startServer(app);

  const base = `http://127.0.0.1:${server.address().port}`;

  for (const [channel, product] of [
    ["signavi_studio", studio],
    ["signavi_store", store]
  ]) {
    const attempt = newAttempt();
    const request = orderRequest(channel, product);

    const result = await post(base, request, attempt);

    assertSafeCreationResponse(result);

    const persisted = await Order.findById(
      result.body.data._id
    );

    assert.ok(persisted);
    assert.equal(persisted.storefront, channel);
    assert.equal(persisted.paymentStatus, "unpaid");

    assert.equal(
      persisted.storefrontCreationAttemptKey,
      attempt.key
    );

    assert.equal(
      verifyGuestCheckoutToken(
        persisted,
        result.body.checkoutToken
      ),
      true
    );

    console.log(
      `PASS: ${channel} HTTP 201, persisted and sanitized`
    );

    const duplicate = await post(base, request, attempt);

    assert.equal(
      duplicate.status,
      409,
      `Expected HTTP 409: ${JSON.stringify(duplicate.body)}`
    );

    assert.equal(
      await Order.countDocuments({
        storefrontCreationAttemptKey: attempt.key
      }),
      1
    );

    console.log(
      `PASS: ${channel} duplicate HTTP attempt rejected`
    );
  }

  const initialCount = await Order.countDocuments();

  const crossed = await post(
    base,
    orderRequest("signavi_store", studio),
    newAttempt()
  );

  assert.notEqual(crossed.status, 201);
  assert.equal(
    await Order.countDocuments(),
    initialCount
  );

  console.log("PASS: Cross-channel product purchase rejected");

  // Eight real HTTP requests race with the same attempt key.
  const raceAttempt = newAttempt();
  const raceBody = orderRequest("signavi_studio", studio);

  const race = await Promise.all(
    Array.from({ length: 8 }, () =>
      post(base, raceBody, raceAttempt)
    )
  );

  const created = race.filter(x => x.status === 201);
  const conflicts = race.filter(x => x.status === 409);

  assert.equal(
    created.length,
    1,
    `Race statuses: ${race.map(x => x.status).join(",")}`
  );

  assert.equal(conflicts.length, 7);

  assert.equal(
    await Order.countDocuments({
      storefrontCreationAttemptKey: raceAttempt.key
    }),
    1
  );

  console.log(
    "PASS: Eight concurrent HTTP requests created exactly one order"
  );

  console.log(
    "PASS: Seven concurrent HTTP attempts returned 409"
  );

  // Remove the index ONLY from the disposable database.
  await Order.collection.dropIndex(
    "unique_storefront_creation_attempt_v1"
  );

  const beforeUnavailable = await Order.countDocuments();

  const unavailable = await post(
    base,
    orderRequest("signavi_studio", studio),
    newAttempt()
  );

  assert.equal(unavailable.status, 503);

  assert.equal(
    await Order.countDocuments(),
    beforeUnavailable
  );

  console.log("PASS: Missing index returns HTTP 503");

  assert.equal(externalHttpAttempts, 0);

  console.log("PASS: No external fetch requests");
  console.log("PASS: No real Square payment execution");
  console.log("PASS: Persistent sandbox never used");
  console.log("PASS: Production database never used");
  console.log("ALL REAL-ROUTER MONGODB HTTP TESTS PASSED");

} finally {
  globalThis.fetch = originalFetch;

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close(error =>
          error ? reject(error) : resolve()
        );
      });
    }
  } finally {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } finally {
      if (memoryServer) {
        await memoryServer.stop();
      }
    }
  }

  console.log("DISPOSABLE TEST DATABASE STOPPED");
}