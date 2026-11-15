import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

const orderId = "a".repeat(24);

const checkLocked = result => {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
};

const read = (listPage, maxPages = 10) =>
  collectV3SandboxPaymentRecordEvidence({
    orderId,
    listPage,
    maxPages
  });

test("empty Square pages cannot establish authoritative clearance", async () => {
  const result = await read(async () => ({
    payments: [],
    cursor: null
  }));

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, false);
  assert.equal(result.reason, "NO_EXPLICIT_SQUARE_PAYMENT_MATCH");
  checkLocked(result);
});

test("an unrelated payment reference cannot establish clearance", async () => {
  const result = await read(async () => ({
    payments: [{
      id: "unrelated-payment",
      referenceId: "unrelated-order"
    }],
    cursor: null
  }));

  assert.equal(result.complete, true);
  assert.equal(result.priorActivityFound, false);
  checkLocked(result);
});

test("matching payment reference detects prior activity", async () => {
  const result = await read(async () => ({
    payments: [{
      id: "previous-payment",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }],
    cursor: null
  }));

  assert.equal(result.priorActivityFound, true);
  assert.equal(result.reason, "POSSIBLE_PRIOR_SQUARE_PAYMENT");
  checkLocked(result);
});

test("payment without a usable reference is rejected", async () => {
  const result = await read(async () => ({
    payments: [{ id: "unidentified-payment" }],
    cursor: null
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_REFERENCE_MISSING");
  checkLocked(result);
});

test("duplicate payment IDs fail closed", async () => {
  const result = await read(async () => ({
    payments: [
      { id: "duplicate", referenceId: "other" },
      { id: "duplicate", referenceId: "other" }
    ],
    cursor: null
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_IDENTITY_INVALID");
  checkLocked(result);
});

test("repeated pagination cursor fails closed", async () => {
  const result = await read(async () => ({
    payments: [],
    cursor: "same-cursor"
  }));

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_CURSOR_INVALID");
  checkLocked(result);
});

test("pagination limit cannot become clearance", async () => {
  const result = await read(async () => ({
    payments: [],
    cursor: "more-pages"
  }), 1);

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_PAGE_LIMIT_REACHED");
  checkLocked(result);
});

test("Square reader exception fails closed", async () => {
  const result = await read(async () => {
    throw new Error("simulated-read-failure");
  });

  assert.equal(result.complete, false);
  assert.equal(result.reason, "SQUARE_PAYMENT_READ_FAILED");
  checkLocked(result);
});