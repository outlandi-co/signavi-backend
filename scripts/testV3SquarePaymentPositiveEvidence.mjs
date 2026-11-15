import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

const orderId = "a".repeat(24);

function read(listPage) {
  return collectV3SandboxPaymentRecordEvidence({
    orderId,
    listPage
  });
}

function locked(result) {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("observed prior payment produces positive-only evidence", async () => {
  const result = await read(async () => ({
    payments: [{
      id: "payment-1",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }],
    cursor: null
  }));

  assert.equal(result.existingPayment, true);
  assert.equal(result.priorActivityFound, true);
  locked(result);
});

test("empty history does not invent a negative payment fact", async () => {
  const result = await read(async () => ({
    payments: [],
    cursor: null
  }));

  assert.equal(result.complete, true);
  assert.equal(Object.hasOwn(result, "existingPayment"), false);
  locked(result);
});

test("unrelated history does not establish clearance", async () => {
  const result = await read(async () => ({
    payments: [{
      id: "unrelated",
      referenceId: "different-order"
    }],
    cursor: null
  }));

  assert.equal(Object.hasOwn(result, "existingPayment"), false);
  locked(result);
});

test("observed payment remains recorded after later failure", async () => {
  let calls = 0;

  const result = await read(async () => {
    calls++;

    if (calls === 1) {
      return {
        payments: [{
          id: "payment-1",
          referenceId: `signavi-v3-sandbox-${orderId}`
        }],
        cursor: "next-page"
      };
    }

    throw new Error("synthetic-reader-failure");
  });

  assert.equal(result.complete, false);
  assert.equal(result.priorActivityFound, true);
  assert.equal(result.existingPayment, true);
  locked(result);
});
