import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3FirstPaymentEvidence
} from "../utils/assessV3FirstPaymentEvidence.js";

const candidate = () => ({
  knownHistory: { knownRecordsClear: true },
  paymentLinks: { complete: true },
  squareOrders: { complete: true },
  squarePayments: { complete: true },
  ownership: { exclusive: true, durable: true }
});

test("missing payment source fails closed", () => {
  const input = candidate();
  delete input.squarePayments;

  const result = assessV3FirstPaymentEvidence(input);

  assert.equal(result.reason, "EVIDENCE_SOURCE_MISSING");
  assert.equal(result.squareRequestAuthorized, false);
});

test("incomplete pagination fails closed", () => {
  const input = candidate();
  input.paymentLinks = { complete: true, hasMore: true };

  const result = assessV3FirstPaymentEvidence(input);

  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assert.equal(result.squareRequestAuthorized, false);
});

test("prior Square payment blocks review", () => {
  const input = candidate();
  input.squarePayments = {
    complete: true,
    priorActivityFound: true
  };

  const result = assessV3FirstPaymentEvidence(input);

  assert.equal(result.reason, "EXISTING_PAYMENT_ACTIVITY");
  assert.equal(result.readyForAuthorizationReview, false);
});

test("identity conflict fails closed", () => {
  const input = candidate();
  input.squareOrders = {
    complete: true,
    identityMismatch: true
  };

  const result = assessV3FirstPaymentEvidence(input);

  assert.equal(result.reason, "PAYMENT_IDENTITY_CONFLICT");
});

test("missing durable ownership fails closed", () => {
  const input = candidate();
  input.ownership = { exclusive: true, durable: false };

  const result = assessV3FirstPaymentEvidence(input);

  assert.equal(
    result.reason,
    "DURABLE_PURCHASE_OWNERSHIP_NOT_VERIFIED"
  );
});

test("uncleared local records fail closed", () => {
  const input = candidate();
  input.knownHistory = { knownRecordsClear: false };

  const result = assessV3FirstPaymentEvidence(input);

  assert.equal(result.reason, "LOCAL_HISTORY_NOT_CLEARED");
});

test("fully claimed evidence never authorizes Square", () => {
  const result = assessV3FirstPaymentEvidence(candidate());

  assert.equal(result.readyForAuthorizationReview, true);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});