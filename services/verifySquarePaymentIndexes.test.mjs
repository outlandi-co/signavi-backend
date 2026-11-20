import assert from "node:assert/strict";
import test from "node:test";

import {
  verifySquarePaymentIndexes
} from "./verifySquarePaymentIndexes.js";

const uniqueIndex = field => ({
  key: { [field]: 1 },
  unique: true,
  partialFilterExpression: {
    [field]: {
      $type: "string",
      $gt: ""
    }
  }
});

test("Both unique indexes are accepted", () => {
  assert.equal(
    verifySquarePaymentIndexes([
      uniqueIndex("squareOrderId"),
      uniqueIndex("squarePaymentId")
    ]).ready,
    true
  );
});

test("Nonunique indexes are rejected", () => {
  const result = verifySquarePaymentIndexes([
    {
      key: { squareOrderId: 1 },
      unique: false
    },
    uniqueIndex("squarePaymentId")
  ]);

  assert.equal(result.ready, false);
  assert.equal(result.fields.squareOrderId, false);
});

test("Missing payment index is rejected", () => {
  assert.equal(
    verifySquarePaymentIndexes([
      uniqueIndex("squareOrderId")
    ]).ready,
    false
  );
});

test("Wrong partial filter is rejected", () => {
  const result = verifySquarePaymentIndexes([
    {
      key: { squareOrderId: 1 },
      unique: true,
      partialFilterExpression: {
        squareOrderId: { $exists: true }
      }
    },
    uniqueIndex("squarePaymentId")
  ]);

  assert.equal(result.ready, false);
});

test("Compound indexes are rejected", () => {
  const result = verifySquarePaymentIndexes([
    {
      key: {
        squareOrderId: 1,
        storefront: 1
      },
      unique: true,
      partialFilterExpression: {
        squareOrderId: {
          $type: "string",
          $gt: ""
        }
      }
    },
    uniqueIndex("squarePaymentId")
  ]);

  assert.equal(result.ready, false);
});

test("Invalid index catalog fails closed", () => {
  assert.throws(
    () => verifySquarePaymentIndexes(null),
    /INVALID_SQUARE_INDEX_CATALOG/
  );
});
