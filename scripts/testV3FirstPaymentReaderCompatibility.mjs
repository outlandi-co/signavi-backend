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

const fixture = () => ({
  knownHistory: { knownRecordsClear: true },
  paymentLinks: source(),
  squareOrders: source(),
  squarePayments: source(),
  ownership: { exclusive: true, durable: true }
});

function assertBlocked(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
}

for (const key of [
  "paymentLinks",
  "squareOrders",
  "squarePayments"
]) {
  test(`${key}: partial reader evidence is blocked`, () => {
    const input = fixture();
    input[key] = {
      complete: true,
      priorActivityFound: false
    };
    const result = reviewV3FirstPaymentEvidenceStrict(input);
    assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
    assertBlocked(result);
  });
}

test("missing pagination field is blocked", () => {
  const input = fixture();
  delete input.squarePayments.hasMore;
  const result = reviewV3FirstPaymentEvidenceStrict(input);
  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  assertBlocked(result);
});

test("missing conflict field is blocked", () => {
  const input = fixture();
  delete input.squareOrders.conflicting;
  const result = reviewV3FirstPaymentEvidenceStrict(input);
  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  assertBlocked(result);
});

test("caller clearance cannot replace reader fields", () => {
  const input = fixture();
  input.paymentLinks = {
    complete: true,
    priorActivityFound: false,
    squareRequestAuthorized: true
  };
  const result = reviewV3FirstPaymentEvidenceStrict(input);
  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  assertBlocked(result);
});

test("complete fixture remains review-only", () => {
  const result = reviewV3FirstPaymentEvidenceStrict(fixture());
  assert.equal(result.readyForAuthorizationReview, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
});
