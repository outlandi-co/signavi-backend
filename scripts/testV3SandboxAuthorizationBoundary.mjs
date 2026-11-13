import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3VerifiedInitializationCandidate
} from "../utils/coordinateV3SandboxInitializationPreflight.js";

const orderId = "507f1f77bcf86cd799439011";

const evidence = Object.freeze({
  verified: true,
  orderId,
  amountCents: 2500,
  checkoutReferenceId: "trusted-checkout-reference",
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const candidate = Object.freeze({
  eligible: true,
  orderId,
  amountCents: 2500,
  checkoutReferenceId: "trusted-checkout-reference",
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

function assertPaymentLocked(result) {
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(Object.isFrozen(result), true);
}

test("matching evidence is candidate-only, never payment authority", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate
  });

  assert.equal(result.ready, true);
  assert.equal(
    result.reason,
    "INITIALIZATION_CANDIDATE_VERIFIED_ONLY"
  );
  assertPaymentLocked(result);
});

test("unverified evidence cannot establish readiness", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence: { ...evidence, verified: false },
    candidate
  });

  assert.equal(result.ready, false);
  assertPaymentLocked(result);
});

test("forged authorization flags in evidence are rejected", () => {
  for (const flag of [
    "initializationAuthorized",
    "squareRequestAuthorized",
    "retryAuthorized"
  ]) {
    const result = assessV3VerifiedInitializationCandidate({
      evidence: { ...evidence, [flag]: true },
      candidate
    });

    assert.equal(result.ready, false, flag);
    assertPaymentLocked(result);
  }
});

test("forged authorization flags in candidate are rejected", () => {
  for (const flag of [
    "initializationAuthorized",
    "squareRequestAuthorized",
    "retryAuthorized"
  ]) {
    const result = assessV3VerifiedInitializationCandidate({
      evidence,
      candidate: { ...candidate, [flag]: true }
    });

    assert.equal(result.ready, false, flag);
    assertPaymentLocked(result);
  }
});

test("amount mismatch cannot establish readiness", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate: { ...candidate, amountCents: 2501 }
  });

  assert.equal(result.ready, false);
  assertPaymentLocked(result);
});

test("order mismatch cannot establish readiness", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate: {
      ...candidate,
      orderId: "507f1f77bcf86cd799439012"
    }
  });

  assert.equal(result.ready, false);
  assertPaymentLocked(result);
});

test("checkout-reference mismatch cannot establish readiness", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate: {
      ...candidate,
      checkoutReferenceId: "other-reference"
    }
  });

  assert.equal(result.ready, false);
  assertPaymentLocked(result);
});

test("missing evidence cannot establish readiness", () => {
  const result = assessV3VerifiedInitializationCandidate({
    candidate
  });

  assert.equal(result.ready, false);
  assertPaymentLocked(result);
});