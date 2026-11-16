import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  verifyV3SandboxOwnershipIndexesReadOnly
} from "../utils/verifyV3SandboxOwnershipIndexesReadOnly.js";

const assertDuplicate = async (collection, document) => {
  await assert.rejects(
    collection.insertOne(document),
    error => error?.code === 11000
  );
};

test("real MongoDB enforces V3 ownership uniqueness without authorizing payment", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox");
  assert.equal(process.env.SMART_SHIPPING_V3_ENABLED, "true");

  const forbidden = [
    "V3_SANDBOX_MONGO_URI",
    "MONGO_URI",
    "MONGODB_URI",
    "SQUARE_ACCESS_TOKEN",
    "SQUARE_SANDBOX_ACCESS_TOKEN",
    "SQUARE_PRODUCTION_ACCESS_TOKEN"
  ];

  for (const name of forbidden) {
    assert.equal(
      process.env[name],
      undefined,
      `${name} must not be provided`
    );
  }

  let replset;
  let connection;

  try {
    replset = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: "wiredTiger"
      }
    });

    const uri = replset.getUri();

    const parsed = new URL(uri);
    const hosts = parsed.host.split(",");

    assert.equal(parsed.protocol, "mongodb:");

    for (const host of hosts) {
      const hostname = host.split(":")[0];

      assert.ok(
        hostname === "127.0.0.1" ||
        hostname === "localhost" ||
        hostname === "::1" ||
        hostname === "[::1]",
        `Non-loopback MongoDB host rejected: ${host}`
      );
    }

    connection = mongoose.createConnection(uri, {
      dbName: "signavi_shipping_v3_dev",
      serverSelectionTimeoutMS: 10000
    });

    await connection.asPromise();

    const database = connection.db;

    assert.equal(
      database.databaseName,
      "signavi_shipping_v3_dev"
    );

    const purchases = database.collection(
      "smart_shipping_v3_purchase_ownership"
    );

    const payments = database.collection(
      "smart_shipping_v3_payment_operations"
    );

    // Create the required real MongoDB indexes.
    await purchases.createIndexes([
      {
        key: {
          environment: 1,
          purchaseKey: 1
        },
        unique: true,
        name: "unique_environment_purchase_key"
      },
      {
        key: {
          environment: 1,
          claimedByDocumentType: 1,
          claimedByDocumentId: 1
        },
        unique: true,
        name: "unique_environment_claimant"
      }
    ]);

    await payments.createIndexes([
      {
        key: { orderId: 1 },
        unique: true,
        name: "unique_payment_order"
      },
      {
        key: { idempotencyKey: 1 },
        unique: true,
        name: "unique_payment_idempotency"
      }
    ]);

    console.log("PASS: FOUR REAL UNIQUE INDEXES INSTALLED");

    // Verify the actual installed indexes.
    const verified =
      await verifyV3SandboxOwnershipIndexesReadOnly({
        purchaseCollection: purchases,
        paymentCollection: payments
      });

    assert.equal(verified.verified, true);
    assert.equal(verified.exclusive, false);
    assert.equal(verified.durable, false);
    assert.equal(verified.squareRequestAuthorized, false);

    console.log("PASS: REAL INDEX VERIFIER ACCEPTS INDEXES");
    console.log("PASS: INDEXES DO NOT AUTHORIZE PAYMENT");

    // Original ownership record.
    const owner = {
      environment: "sandbox",
      purchaseKey: "purchase-original",
      claimedByDocumentType: "StoreOrder",
      claimedByDocumentId: "order-original",
      ownerMarker: "original-owner"
    };

    await purchases.insertOne(owner);

    // Duplicate purchase key, different claimant.
    await assertDuplicate(purchases, {
      environment: "sandbox",
      purchaseKey: "purchase-original",
      claimedByDocumentType: "StoreOrder",
      claimedByDocumentId: "order-other"
    });

    console.log("PASS: DUPLICATE PURCHASE KEY REJECTED");

    // Duplicate claimant, different purchase key.
    await assertDuplicate(purchases, {
      environment: "sandbox",
      purchaseKey: "purchase-other",
      claimedByDocumentType: "StoreOrder",
      claimedByDocumentId: "order-original"
    });

    console.log("PASS: DUPLICATE CLAIMANT REJECTED");

    const preserved = await purchases.findOne({
      environment: "sandbox",
      purchaseKey: "purchase-original"
    });

    assert.equal(preserved.ownerMarker, "original-owner");

    assert.equal(
      await purchases.countDocuments({}),
      1
    );

    console.log("PASS: ORIGINAL OWNERSHIP PRESERVED");

    // Original payment operation.
    await payments.insertOne({
      orderId: "payment-order-original",
      idempotencyKey: "idempotency-original",
      marker: "original-payment"
    });

    await assertDuplicate(payments, {
      orderId: "payment-order-original",
      idempotencyKey: "idempotency-other"
    });

    console.log("PASS: DUPLICATE PAYMENT ORDER REJECTED");

    await assertDuplicate(payments, {
      orderId: "payment-order-other",
      idempotencyKey: "idempotency-original"
    });

    console.log("PASS: DUPLICATE IDEMPOTENCY KEY REJECTED");

    const originalPayment = await payments.findOne({
      orderId: "payment-order-original"
    });

    assert.equal(
      originalPayment.marker,
      "original-payment"
    );

    assert.equal(
      await payments.countDocuments({}),
      1
    );

    console.log("PASS: ORIGINAL PAYMENT OPERATION PRESERVED");

    // Competing claims for the same purchase.
    const contenders = [
      {
        environment: "sandbox",
        purchaseKey: "concurrent-purchase",
        claimedByDocumentType: "StoreOrder",
        claimedByDocumentId: "concurrent-owner-a"
      },
      {
        environment: "sandbox",
        purchaseKey: "concurrent-purchase",
        claimedByDocumentType: "StoreOrder",
        claimedByDocumentId: "concurrent-owner-b"
      }
    ];

    const results = await Promise.allSettled(
      contenders.map(document =>
        purchases.insertOne(document)
      )
    );

    const succeeded = results.filter(
      result => result.status === "fulfilled"
    );

    const rejected = results.filter(
      result => result.status === "rejected"
    );

    assert.equal(succeeded.length, 1);
    assert.equal(rejected.length, 1);

    assert.equal(rejected[0].reason?.code, 11000);

    assert.equal(
      await purchases.countDocuments({
        environment: "sandbox",
        purchaseKey: "concurrent-purchase"
      }),
      1
    );

    console.log("PASS: ONLY ONE CONCURRENT OWNER SUCCEEDED");
    console.log("PASS: COMPETING OWNER REJECTED WITH 11000");

    // Verify the indexes did not grant execution authority.
    const finalVerification =
      await verifyV3SandboxOwnershipIndexesReadOnly({
        purchaseCollection: purchases,
        paymentCollection: payments
      });

    assert.equal(finalVerification.verified, true);
    assert.equal(finalVerification.exclusive, false);
    assert.equal(finalVerification.durable, false);
    assert.equal(
      finalVerification.squareRequestAuthorized,
      false
    );

    console.log("PASS: FIRST-PAYMENT AUTHORIZATION REMAINS FALSE");
  } finally {
    if (connection) {
      await connection.close();
    }

    if (replset) {
      await replset.stop();
    }

    console.log("PASS: DISPOSABLE MONGODB CLEANUP COMPLETE");
  }
});
