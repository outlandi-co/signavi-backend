import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyV3SandboxOwnershipIndexesReadOnly
} from "../utils/verifyV3SandboxOwnershipIndexesReadOnly.js";

const purchaseIndexes = [
  {
    key: { environment: 1, purchaseKey: 1 },
    unique: true
  },
  {
    key: {
      environment: 1,
      claimedByDocumentType: 1,
      claimedByDocumentId: 1
    },
    unique: true
  }
];

const paymentIndexes = [
  { key: { orderId: 1 }, unique: true },
  { key: { idempotencyKey: 1 }, unique: true }
];

const collection = indexes => ({
  listIndexes: () => ({
    toArray: async () => indexes
  })
});

const verify = (p, o) =>
  verifyV3SandboxOwnershipIndexesReadOnly({
    purchaseCollection: collection(p),
    paymentCollection: collection(o)
  });

test("required indexes verify without authorizing payment", async () => {
  const result = await verify(purchaseIndexes, paymentIndexes);

  assert.equal(result.verified, true);
  assert.equal(result.exclusive, false);
  assert.equal(result.durable, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("missing purchase-key index blocks verification", async () => {
  const result = await verify(
    purchaseIndexes.slice(1),
    paymentIndexes
  );

  assert.equal(result.verified, false);
  assert.equal(
    result.reason,
    "PURCHASE_KEY_UNIQUE_INDEX_MISSING"
  );
});

test("nonunique payment index blocks verification", async () => {
  const result = await verify(
    purchaseIndexes,
    [
      { key: { orderId: 1 }, unique: false },
      paymentIndexes[1]
    ]
  );

  assert.equal(result.verified, false);
  assert.equal(
    result.reason,
    "PAYMENT_ORDER_UNIQUE_INDEX_MISSING"
  );
});

test("partial unique index cannot replace global uniqueness", async () => {
  const result = await verify(
    [{
      ...purchaseIndexes[0],
      partialFilterExpression: { status: "pending" }
    }, purchaseIndexes[1]],
    paymentIndexes
  );

  assert.equal(result.verified, false);
});

test("database index-read failure fails closed", async () => {
  const result = await verifyV3SandboxOwnershipIndexesReadOnly({
    purchaseCollection: {
      listIndexes: () => ({
        toArray: async () => {
          throw new Error("Simulated database error");
        }
      })
    },
    paymentCollection: collection(paymentIndexes)
  });

  assert.equal(result.verified, false);
  assert.equal(
    result.reason,
    "MONGODB_INDEX_INSPECTION_FAILED"
  );
  assert.equal(result.squareRequestAuthorized, false);
});