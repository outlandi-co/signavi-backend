import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const dbName = "signavi_shipping_v3_dev";

async function fixture(t) {
  const server = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  });

  const connection = await mongoose
    .createConnection(server.getUri(), { dbName })
    .asPromise();

  t.after(async () => {
    await connection.close();
    await server.stop();
  });

  const orders = connection.db.collection("test_orders");
  const claims = connection.db.collection("test_payment_claims");

  await orders.insertOne({
    _id: "synthetic-order-1",
    paymentStatus: "unpaid"
  });

  return { connection, orders, claims };
}

async function claimAndPay({
  connection,
  orders,
  claims,
  paymentId,
  orderId = "synthetic-order-1",
  forceRollback = false
}) {
  const session = await connection.startSession();

  try {
    await session.withTransaction(async () => {
      await claims.insertMany([
        {
          _id: `sandbox:payment:${paymentId}`,
          paymentId,
          orderId
        },
        {
          _id: `sandbox:order:${orderId}`,
          paymentId,
          orderId
        }
      ], { session });

      const result = await orders.updateOne(
        {
          _id: orderId,
          paymentStatus: "unpaid"
        },
        {
          $set: {
            paymentStatus: "paid",
            squarePaymentId: paymentId
          }
        },
        { session }
      );

      if (result.modifiedCount !== 1) {
        throw new Error("ORDER_NOT_PAYABLE");
      }

      if (forceRollback) {
        throw new Error("FORCED_ROLLBACK");
      }
    });
  } finally {
    await session.endSession();
  }
}

test("atomic transaction commits both claims and order", async t => {
  const f = await fixture(t);

  await claimAndPay({ ...f, paymentId: "test-payment-a" });

  const order = await f.orders.findOne({
    _id: "synthetic-order-1"
  });

  assert.equal(order.paymentStatus, "paid");
  assert.equal(
    await f.claims.countDocuments({}),
    2
  );
});

test("transaction rollback removes both claims and payment update", async t => {
  const f = await fixture(t);

  await assert.rejects(
    claimAndPay({
      ...f,
      paymentId: "test-payment-b",
      forceRollback: true
    }),
    /FORCED_ROLLBACK/
  );

  const order = await f.orders.findOne({
    _id: "synthetic-order-1"
  });

  assert.equal(order.paymentStatus, "unpaid");
  assert.equal(
    await f.claims.countDocuments({}),
    0
  );
});

test("same payment cannot claim a second order", async t => {
  const f = await fixture(t);

  await f.orders.insertOne({
    _id: "synthetic-order-2",
    paymentStatus: "unpaid"
  });

  await claimAndPay({
    ...f,
    paymentId: "test-payment-c"
  });

  await assert.rejects(
    claimAndPay({
      ...f,
      paymentId: "test-payment-c",
      orderId: "synthetic-order-2"
    }),
    error => error?.code === 11000
  );

  const second = await f.orders.findOne({
    _id: "synthetic-order-2"
  });

  assert.equal(second.paymentStatus, "unpaid");
  assert.equal(await f.claims.countDocuments({}), 2);
});

test("different payment cannot claim the already-paid order", async t => {
  const f = await fixture(t);

  await claimAndPay({
    ...f,
    paymentId: "test-payment-d"
  });

  await assert.rejects(
    claimAndPay({
      ...f,
      paymentId: "test-payment-e"
    }),
    error => error?.code === 11000
  );

  const order = await f.orders.findOne({
    _id: "synthetic-order-1"
  });

  assert.equal(order.squarePaymentId, "test-payment-d");
  assert.equal(await f.claims.countDocuments({}), 2);
});

console.log("STEP 751 — SYNTHETIC TRANSACTION TESTS");
console.log("NO SQUARE API REQUESTS");
console.log("NO EXISTING DATABASE CONNECTIONS");
