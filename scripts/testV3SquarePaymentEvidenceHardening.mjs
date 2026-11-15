import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

const orderId = "a".repeat(24);

const read = listPage =>
  collectV3SandboxPaymentRecordEvidence({
    orderId,
    listPage
  });

function assertLocked(result) {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("malformed Square errors object fails closed", async () => {
  const result = await read(async () => ({
    payments: [],
    cursor: null,
    errors: {}
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_RESPONSE_INVALID");
  assertLocked(result);
});

test("non-array Square errors string fails closed", async () => {
  const result = await read(async () => ({
    payments: [],
    cursor: null,
    errors: "unexpected"
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_RESPONSE_INVALID");
  assertLocked(result);
});

test("payment IDs differing only by whitespace are duplicates", async () => {
  const result = await read(async () => ({
    payments: [
      { id: "payment-123", referenceId: "other-order" },
      { id: " payment-123 ", referenceId: "other-order" }
    ],
    cursor: null
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_IDENTITY_INVALID");
  assertLocked(result);
});

test("empty Square errors array remains valid review evidence", async () => {
  const result = await read(async () => ({
    payments: [],
    cursor: null,
    errors: []
  }));

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assertLocked(result);
});

test("detected prior payment still cannot authorize creation", async () => {
  const result = await read(async () => ({
    payments: [{
      id: "previous-payment",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }],
    cursor: null
  }));

  assert.equal(result.priorActivityFound, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assertLocked(result);
});
