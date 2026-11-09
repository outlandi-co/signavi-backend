import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3ExternalReconciliation
} from "../utils/assessV3ExternalReconciliation.js";

const orderId = "507f1f77bcf86cd799439011";

const knownHistory = {
  knownRecordsClear: true,
  source: "MongoDB"
};

const check = (evidence) =>
  assessV3ExternalReconciliation({
    orderId,
    knownHistory,
    squareEvidence: evidence
  });

test("empty external history never authorizes payment", () => {
  const result = check({
    complete: true,
    existingPayment: false,
    existingLink: false
  });

  assert.equal(result.cleared, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.httpStatus, 423);
});

test("claimed authoritative clearance cannot override policy", () => {
  const result = check({
    complete: true,
    authoritativeNoPriorActivity: true,
    verified: true,
    existingPayment: false,
    existingLink: false
  });

  assert.equal(result.cleared, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("existing Square payment blocks authorization", () => {
  const result = check({
    existingPayment: true
  });

  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(
    result.reason,
    "EXISTING_SQUARE_ACTIVITY_REQUIRES_RECONCILIATION"
  );
});

test("conflicting Square identity blocks authorization", () => {
  const result = check({
    identityMismatch: true
  });

  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.reason, "SQUARE_EVIDENCE_CONFLICT");
});

test("uncleared local history blocks authorization", () => {
  const result = assessV3ExternalReconciliation({
    orderId,
    knownHistory: {
      knownRecordsClear: false
    },
    squareEvidence: {
      complete: true
    }
  });

  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(
    result.reason,
    "KNOWN_PAYMENT_HISTORY_NOT_CLEARED"
  );
});