import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptV3FirstPaymentReaderEvidence
} from "../utils/adaptV3FirstPaymentReaderEvidence.js";

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

const snapshot = () => ({
  knownHistory: { knownRecordsClear: true },
  paymentLinks: source(),
  squareOrders: source(),
  squarePayments: source(),
  ownership: { exclusive: true, durable: true }
});

function noAuthority(result) {
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(Object.isFrozen(result), true);
}

test("complete mock snapshot remains review-only", () => {
  const result = adaptV3FirstPaymentReaderEvidence(snapshot());

  assert.equal(result.readyForAuthorizationReview, true);
  noAuthority(result);
});

test("partial Square link snapshot fails closed", () => {
  const input = snapshot();
  input.paymentLinks = { complete: true, priorActivityFound: false };

  const result = adaptV3FirstPaymentReaderEvidence(input);

  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  assert.equal(result.readyForAuthorizationReview, false);
  noAuthority(result);
});

test("partial Square order snapshot fails closed", () => {
  const input = snapshot();
  input.squareOrders = { complete: true, priorActivityFound: false };

  const result = adaptV3FirstPaymentReaderEvidence(input);

  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  noAuthority(result);
});

test("partial Square payment snapshot fails closed", () => {
  const input = snapshot();
  input.squarePayments = { complete: true, priorActivityFound: false };

  const result = adaptV3FirstPaymentReaderEvidence(input);

  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  noAuthority(result);
});

test("unknown pagination cannot become clearance", () => {
  const input = snapshot();
  delete input.squarePayments.hasMore;

  const result = adaptV3FirstPaymentReaderEvidence(input);

  assert.equal(result.reason, "EVIDENCE_FIELD_INVALID");
  noAuthority(result);
});

test("prior Square activity blocks review", () => {
  const input = snapshot();
  input.paymentLinks.priorActivityFound = true;

  const result = adaptV3FirstPaymentReaderEvidence(input);

  assert.equal(result.reason, "EXISTING_PAYMENT_ACTIVITY");
  noAuthority(result);
});

test("caller authorization flag cannot authorize payment", () => {
  const input = snapshot();
  input.squareRequestAuthorized = true;
  input.paymentLinks.squareRequestAuthorized = true;

  const result = adaptV3FirstPaymentReaderEvidence(input);

  assert.equal(result.readyForAuthorizationReview, true);
  noAuthority(result);
});

test("invalid reader snapshot fails closed", () => {
  for (const input of [null, [], "clear", true]) {
    const result = adaptV3FirstPaymentReaderEvidence(input);

    assert.equal(result.reason, "READER_SNAPSHOT_INVALID");
    assert.equal(result.readyForAuthorizationReview, false);
    noAuthority(result);
  }
});
