import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";

import {
  verifySquarePaymentIndexes
} from "./verifySquarePaymentIndexes.js";

const binaryPath = process.env.SIGNAVI_TEST_MONGOD_BINARY;

if (!binaryPath || !existsSync(binaryPath)) {
  throw new Error("ISOLATED_MONGODB_BINARY_REQUIRED");
}

// No production URI, Mongoose connection, or application
// database configuration is used by this test file.
const server = await MongoMemoryServer.create({
  binary: {
    systemBinary: binaryPath
  },
  instance: {
    ip: "127.0.0.1"
  }
});

const uri = server.getUri();

if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri)) {
  await server.stop();
  throw new Error("UNEXPECTED_MONGODB_TEST_ADDRESS");
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000
});

const suffix = randomUUID().replaceAll("-", "");

const storeDb = client.db(`signavi_test_store_${suffix}`);
const studioDb = client.db(`signavi_test_studio_${suffix}`);

const store = storeDb.collection("orders");
const studio = studioDb.collection("orders");

const paymentId = "synthetic-square-payment-001";
const squareOrderId = "synthetic-square-order-001";

function createOrder(overrides = {}) {
  return {
    _id: new ObjectId(),
    storefront: "signavi_store",
    squareEnvironment: "sandbox",
    paymentStatus: "unpaid",
    status: "payment_required",
    squareExpectedAmountCents: 2599,
    timeline: [],
    ...overrides
  };
}

// Mirrors the relevant V3 sandbox atomic predicates.
// Real production behavior remains determined by
// routes/squareWebhook.js.
function paymentFilter(id, identifiers = {}) {
  const selectedPaymentId = identifiers.paymentId ?? paymentId;
  const selectedSquareOrderId =
    identifiers.squareOrderId ?? squareOrderId;

  return {
    _id: id,
    storefront: "signavi_store",
    squareEnvironment: "sandbox",
    paymentStatus: {
      $nin: ["paid", "refunded"]
    },
    status: {
      $nin: ["shipped", "delivered", "cancelled"]
    },
    squarePaymentId: {
      $in: [null, "", selectedPaymentId]
    },
    $or: [
      { squareOrderId: { $exists: false } },
      { squareOrderId: null },
      { squareOrderId: "" },
      { squareOrderId: selectedSquareOrderId }
    ]
  };
}

function paymentUpdate(identifiers = {}) {
  const selectedPaymentId = identifiers.paymentId ?? paymentId;
  const selectedSquareOrderId =
    identifiers.squareOrderId ?? squareOrderId;

  return {
    $set: {
      paymentStatus: "paid",
      paymentMethod: "Square",
      squarePaymentId: selectedPaymentId,
      squareOrderId: selectedSquareOrderId,
      squareExpectedAmountCents: 2599,
      status: "paid",
      paidAt: new Date()
    },
    $push: {
      timeline: {
        status: "paid",
        date: new Date(),
        note: "Verified Square payment; hold for fulfillment review"
      }
    }
  };
}

async function markPaid(id, identifiers = {}) {
  return store.findOneAndUpdate(
    paymentFilter(id, identifiers),
    paymentUpdate(identifiers),
    { returnDocument: "after" }
  );
}

try {
  await client.connect();

  // Explicitly install indexes in this disposable database.
  // This does not install or modify production indexes.
  await store.createIndex(
    { squarePaymentId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        squarePaymentId: { $type: "string", $gt: "" }
      }
    }
  );

  await store.createIndex(
    { squareOrderId: 1 },
    {
      unique: true,
      partialFilterExpression: {
        squareOrderId: { $type: "string", $gt: "" }
      }
    }
  );


  await test("Real MongoDB Square indexes satisfy readiness verifier", async () => {
    const indexes = await store.listIndexes().toArray();

    const result = verifySquarePaymentIndexes(indexes);

    assert.equal(result.ready, true);
    assert.equal(result.fields.squarePaymentId, true);
    assert.equal(result.fields.squareOrderId, true);
  });

  await test("Multiple unpaid orders may have empty Square identifiers", async () => {
    const first = createOrder({
      squarePaymentId: "",
      squareOrderId: ""
    });

    const second = createOrder({
      squarePaymentId: "",
      squareOrderId: ""
    });

    await store.insertMany([first, second]);

    assert.equal(
      await store.countDocuments({
        _id: { $in: [first._id, second._id] },
        squarePaymentId: "",
        squareOrderId: ""
      }),
      2
    );
  });

  await test("Real MongoDB performs one authorized Store payment update", async () => {
    const order = createOrder();

    await store.insertOne(order);

    const updated = await markPaid(order._id);

    assert.ok(updated);
    assert.equal(updated.paymentStatus, "paid");
    assert.equal(updated.squarePaymentId, paymentId);
    assert.equal(updated.timeline.length, 1);
  });

  await test("Concurrent duplicate events perform only one transition", async () => {
    const order = createOrder();

    const identifiers = {
      paymentId: "synthetic-square-payment-concurrent-001",
      squareOrderId: "synthetic-square-order-concurrent-001"
    };

    await store.insertOne(order);

    const attempts = await Promise.all([
      markPaid(order._id, identifiers),
      markPaid(order._id, identifiers)
    ]);

    assert.equal(
      attempts.filter(Boolean).length,
      1
    );

    const persisted = await store.findOne({ _id: order._id });

    assert.equal(persisted.paymentStatus, "paid");
    assert.equal(persisted.timeline.length, 1);

    const replay = await markPaid(order._id, identifiers);

    assert.equal(replay, null);
  });

  await test("Concurrent Store-to-Studio change blocks payment", async () => {
    const order = createOrder();

    await store.insertOne(order);

    await store.updateOne(
      { _id: order._id },
      { $set: { storefront: "signavi_studio" } }
    );

    const updated = await markPaid(order._id);

    assert.equal(updated, null);

    const persisted = await store.findOne({ _id: order._id });

    assert.equal(persisted.paymentStatus, "unpaid");
    assert.equal(persisted.storefront, "signavi_studio");
  });

  await test("Shipped order cannot be marked paid", async () => {
    const order = createOrder({
      status: "shipped"
    });

    await store.insertOne(order);

    assert.equal(await markPaid(order._id), null);
  });

  await test("Refunded order cannot be marked paid", async () => {
    const order = createOrder({
      paymentStatus: "refunded"
    });

    await store.insertOne(order);

    assert.equal(await markPaid(order._id), null);
  });

  await test("Unique Square payment index rejects duplicate identities", async () => {
    const first = createOrder({
      squarePaymentId: "unique-test-payment-001"
    });

    const second = createOrder({
      squarePaymentId: "unique-test-payment-001"
    });

    await store.insertOne(first);

    await assert.rejects(
      store.insertOne(second),
      error => error?.code === 11000
    );

    assert.equal(
      await store.countDocuments({
        squarePaymentId: "unique-test-payment-001"
      }),
      1
    );
  });

  await test("Unique Square order index rejects duplicate identities", async () => {
    const first = createOrder({
      squareOrderId: "unique-test-order-001"
    });

    const second = createOrder({
      squareOrderId: "unique-test-order-001"
    });

    await store.insertOne(first);

    await assert.rejects(
      store.insertOne(second),
      error => error?.code === 11000
    );

    assert.equal(
      await store.countDocuments({
        squareOrderId: "unique-test-order-001"
      }),
      1
    );
  });

  await test("Studio and Store test databases remain separate", async () => {
    const id = new ObjectId();

    await store.insertOne(
      createOrder({
        _id: id,
        storefront: "signavi_store"
      })
    );

    await studio.insertOne(
      createOrder({
        _id: id,
        storefront: "signavi_studio"
      })
    );

    const storeOrder = await store.findOne({ _id: id });
    const studioOrder = await studio.findOne({ _id: id });

    assert.equal(storeOrder.storefront, "signavi_store");
    assert.equal(studioOrder.storefront, "signavi_studio");

    await store.updateOne(
      { _id: id },
      { $set: { status: "store_only_update" } }
    );

    const unchangedStudio = await studio.findOne({ _id: id });

    assert.equal(
      unchangedStudio.status,
      "payment_required"
    );
  });

  console.log("REAL_ISOLATED_MONGODB_ATOMIC_TESTS_VERIFIED");

} finally {
  await client.close();
  await server.stop();
}
