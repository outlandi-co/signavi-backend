import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3VerifiedInitializationCandidate,
  coordinateV3SandboxInitializationPreflight
} from "../utils/coordinateV3SandboxInitializationPreflight.js";

const id = "6aec6ff81538ade490af0a5b";

const evidence = {
  verified: true,
  orderId: id,
  amountCents: 4722,
  checkoutReferenceId: "checkout-test-reference",
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
};

const candidate = {
  eligible: true,
  orderId: id,
  amountCents: 4722,
  checkoutReferenceId: "checkout-test-reference",
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
};

const assertLocked = result => {
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
};

test("matching evidence produces read-only readiness", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate
  });

  assert.equal(result.ready, true);
  assert.equal(result.orderId, id);
  assert.equal(result.amountCents, 4722);
  assert.equal(result.checkoutReferenceId, "checkout-test-reference");
  assertLocked(result);
});

test("missing evidence fails closed", () => {
  const result = assessV3VerifiedInitializationCandidate({
    candidate
  });

  assert.equal(result.ready, false);
  assertLocked(result);
});

test("unverified history cannot produce readiness", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence: { ...evidence, verified: false },
    candidate
  });

  assert.equal(result.ready, false);
  assertLocked(result);
});

test("evidence claiming authorization is rejected", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence: { ...evidence, initializationAuthorized: true },
    candidate
  });

  assert.equal(result.ready, false);
  assertLocked(result);
});

test("candidate claiming Square authorization is rejected", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate: { ...candidate, squareRequestAuthorized: true }
  });

  assert.equal(result.ready, false);
  assertLocked(result);
});

test("changed payment amount is rejected", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate: { ...candidate, amountCents: 4723 }
  });

  assert.equal(result.ready, false);
  assertLocked(result);
});

test("changed order identity is rejected", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate: {
      ...candidate,
      orderId: "6aec6ff81538ade490af0a5c"
    }
  });

  assert.equal(result.ready, false);
  assertLocked(result);
});

test("missing checkout credentials cannot initialize", async () => {
  const result =
    await coordinateV3SandboxInitializationPreflight();

  assert.equal(result.ready, false);
  assertLocked(result);
});

test("mismatched checkout reference is rejected", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate: {
      ...candidate,
      checkoutReferenceId: "different-reference"
    }
  });

  assert.equal(result.ready, false);
  assert.equal(result.reason, "INITIALIZATION_IDENTITY_OR_AMOUNT_MISMATCH");
  assertLocked(result);
});

test("missing checkout reference is rejected", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence: { ...evidence, checkoutReferenceId: undefined },
    candidate
  });

  assert.equal(result.ready, false);
  assertLocked(result);
});
