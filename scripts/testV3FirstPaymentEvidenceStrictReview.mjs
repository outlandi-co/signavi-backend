import test from "node:test";
import assert from "node:assert/strict";

import {
  reviewV3FirstPaymentEvidenceStrict
} from "../utils/reviewV3FirstPaymentEvidenceStrict.js";

const source = () => ({
  complete: true,
  hasMore: false,
  timedOut: false,
  priorActivityFound: false,
  existingPayment: false,
  existingLink: false,
  conflicting: false,
  identityMismatch: false
});

const candidate = () => ({
  knownHistory: { knownRecordsClear: true },
  paymentLinks: source(),
  squareOrders: source(),
  squarePayments: source(),
  ownership: { exclusive: true, durable: true }
});

const assertNoAuthority = (result) => {
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(Object.isFrozen(result), true);
};

test("valid shaped evidence remains review-only", () => {
  const result = reviewV3FirstPaymentEvidenceStrict(candidate());

  assert.equal(result.readyForAuthorizationReview, true);
  assert.equal(
    result.reason,
    "EVIDENCE_CANDIDATE_REQUIRES_TRUSTED_REVIEW"
  );
  assertNoAuthority(result);
});

test("missing source is rejected", () => {
  const input = candidate();
  delete input.squarePayments;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.reason, "EVIDENCE_SOURCE_MISSING");
  assertNoAuthority(result);
});

test("missing boolean status is rejected", () => {
  const input = candidate();
  delete input.paymentLinks.hasMore;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  assertNoAuthority(result);
});

test("string-valued clearance is rejected", () => {
  const input = candidate();
  input.squareOrders.complete = "true";

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  assertNoAuthority(result);
});

test("incomplete pagination is rejected", () => {
  const input = candidate();
  input.paymentLinks.hasMore = true;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assertNoAuthority(result);
});

test("timed-out history is rejected", () => {
  const input = candidate();
  input.squarePayments.timedOut = true;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.reason, "EVIDENCE_INCOMPLETE");
  assertNoAuthority(result);
});

test("existing payment activity is rejected", () => {
  const input = candidate();
  input.squarePayments.existingPayment = true;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.reason, "EXISTING_PAYMENT_ACTIVITY");
  assertNoAuthority(result);
});

test("identity conflict is rejected", () => {
  const input = candidate();
  input.squareOrders.identityMismatch = true;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.reason, "PAYMENT_IDENTITY_CONFLICT");
  assertNoAuthority(result);
});

test("missing durable ownership is rejected", () => {
  const input = candidate();
  input.ownership.durable = false;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(
    result.reason,
    "DURABLE_PURCHASE_OWNERSHIP_NOT_VERIFIED"
  );
  assertNoAuthority(result);
});

test("uncleared known history is rejected", () => {
  const input = candidate();
  input.knownHistory.knownRecordsClear = false;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.reason, "LOCAL_HISTORY_NOT_CLEARED");
  assertNoAuthority(result);
});

test("malformed input fails closed", () => {
  for (const input of [null, [], "approved", true]) {
    const result = reviewV3FirstPaymentEvidenceStrict(input);

    assert.equal(result.reason, "EVIDENCE_INPUT_INVALID");
    assertNoAuthority(result);
  }
});

test("caller authorization flags are not trusted", () => {
  const input = candidate();
  input.squareRequestAuthorized = true;
  input.initializationAuthorized = true;
  input.retryAuthorized = true;

  const result = reviewV3FirstPaymentEvidenceStrict(input);

  assert.equal(result.readyForAuthorizationReview, true);
  assertNoAuthority(result);
});
