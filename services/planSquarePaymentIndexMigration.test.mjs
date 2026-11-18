import test from "node:test";
import assert from "node:assert/strict";

import {
  planSquarePaymentIndexMigration
} from "./planSquarePaymentIndexMigration.mjs";

const fields = ["squareOrderId", "squarePaymentId"];

const expectedIndex = field => ({
  name: `unique_${field}_nonempty_v1`,
  key: { [field]: 1 },
  unique: true,
  partialFilterExpression: {
    [field]: {
      $type: "string",
      $gt: ""
    }
  }
});

const zeroDuplicates = () => ({
  squareOrderId: 0,
  squarePaymentId: 0
});

const plan = (indexes, duplicates = zeroDuplicates()) =>
  planSquarePaymentIndexMigration({
    listIndexes: async () => indexes,
    auditDuplicates: async () => duplicates
  });

test("Missing readers fail closed", async () => {
  const result = await planSquarePaymentIndexMigration();

  assert.equal(result.safe, false);
  assert.equal(result.action, "stop");
});

test("Verified indexes require no migration", async () => {
  const result = await plan(fields.map(expectedIndex));

  assert.equal(result.safe, true);
  assert.equal(result.action, "none");
  assert.equal(result.mayCreateIndex, false);
});

test("Missing indexes produce manual-only specifications", async () => {
  const result = await plan([
    { name: "_id_", key: { _id: 1 }, unique: true }
  ]);

  assert.equal(result.safe, true);
  assert.equal(result.action, "manual-migration-required");
  assert.equal(result.proposedIndexes.length, 2);
  assert.equal(result.mayCreateIndex, false);
});

test("Existing nonunique Square index blocks migration", async () => {
  const result = await plan([
    { name: "squareOrderId_1", key: { squareOrderId: 1 } }
  ]);

  assert.equal(result.safe, false);
  assert.equal(result.action, "stop");
  assert.equal(result.reason, "index-conflict");
  assert.equal(result.field, "squareOrderId");
});

test("Duplicate Square identifiers block migration", async () => {
  const result = await plan([], {
    squareOrderId: 2,
    squarePaymentId: 1
  });

  assert.equal(result.safe, false);
  assert.equal(result.reason, "duplicate-square-identifiers");
  assert.equal(result.duplicateCounts.squareOrderId, 2);
});

test("Invalid duplicate audit fails closed", async () => {
  const result = await plan([], {
    squareOrderId: -1,
    squarePaymentId: 0
  });

  assert.equal(result.safe, false);
  assert.equal(result.reason, "invalid-duplicate-audit");
});

test("Index inspection errors fail closed", async () => {
  const result = await planSquarePaymentIndexMigration({
    listIndexes: async () => {
      throw new Error("Synthetic inspection failure");
    },
    auditDuplicates: async () => zeroDuplicates()
  });

  assert.equal(result.safe, false);
  assert.equal(result.reason, "inspection-failed");
});

test("Duplicate audit errors fail closed", async () => {
  const result = await planSquarePaymentIndexMigration({
    listIndexes: async () => [],
    auditDuplicates: async () => {
      throw new Error("Synthetic audit failure");
    }
  });

  assert.equal(result.safe, false);
  assert.equal(result.reason, "inspection-failed");
});

test("Planner never exposes index creation permission", async () => {
  for (const indexes of [
    [],
    fields.map(expectedIndex),
    [{ name: "squareOrderId_1", key: { squareOrderId: 1 } }]
  ]) {
    const result = await plan(indexes);

    assert.equal(result.mayCreateIndex, false);
    assert.equal(result.mayExecutePayment, false);
  }
});
