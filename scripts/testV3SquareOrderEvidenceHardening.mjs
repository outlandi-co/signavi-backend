import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

const orderId = "a".repeat(24);

const read = listPage =>
  collectV3SandboxOrderRecordEvidence({
    orderId,
    listPage
  });

function assertLocked(result) {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("malformed Square Orders errors object fails closed", async () => {
  const result = await read(async () => ({
    orders: [],
    cursor: null,
    errors: {}
  }));

  assert.equal(result.complete, false);
  assertLocked(result);
});

test("Square Orders errors string fails closed", async () => {
  const result = await read(async () => ({
    orders: [],
    cursor: null,
    errors: "unexpected"
  }));

  assert.equal(result.complete, false);
  assertLocked(result);
});

test("order IDs differing only by whitespace are duplicates", async () => {
  const result = await read(async () => ({
    orders: [
      { id: "square-order-123", referenceId: "unrelated-order" },
      { id: " square-order-123 ", referenceId: "unrelated-order" }
    ],
    cursor: null
  }));

  assert.equal(result.complete, false);
  assertLocked(result);
});

test("empty Square Orders errors array remains review-only", async () => {
  const result = await read(async () => ({
    orders: [],
    cursor: null,
    errors: []
  }));

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, false);
  assertLocked(result);
});

test("matching Square order detects prior activity without authorization", async () => {
  const result = await read(async () => ({
    orders: [{
      id: "existing-square-order",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }],
    cursor: null
  }));

  assert.equal(result.priorActivityFound, true);
  assertLocked(result);
});
