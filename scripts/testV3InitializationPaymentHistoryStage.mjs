import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyV3InitializationPaymentHistoryStage
} from "../utils/classifyV3InitializationPaymentHistoryStage.js";

const id = "6aec6ff81538ade490af0a5b";

function fixture() {
  return {
    orderId: id,
    amountCents: 4722,
    operation: {
      orderId: id,
      environment: "sandbox",
      status: "pending",
      amountCents: 4722,
      idempotencyKey: "signavi-v3-sandbox-test",
      checkoutReferenceId: "checkout-test-reference",
      requestOwner: "",
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: "",
      squarePaymentId: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      squareDiagnostic: null,
      lastError: ""
    },
    knownHistory: {
      verified: false,
      knownRecordsClear: false,
      source: "SmartShippingV3PaymentOperation"
    }
  };
}

function noAuthorization(result) {
  assert.equal(result.paymentHistoryVerified, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("pristine pending operation is classified but not cleared", () => {
  const result = classifyV3InitializationPaymentHistoryStage(
    fixture()
  );

  assert.equal(result.candidate, true);
  assert.equal(result.reason, "PRISTINE_PENDING_OPERATION_ONLY");
  noAuthorization(result);
});

test("Square creation attempt blocks candidate", () => {
  const input = fixture();
  input.operation.squareCreationAttemptClaimedAt = new Date();

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});

test("Square payment ID blocks candidate", () => {
  const input = fixture();
  input.operation.squarePaymentId = "existing-payment";

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});

test("Square link blocks candidate", () => {
  const input = fixture();
  input.operation.squarePaymentLinkId = "existing-link";

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});

test("existing owner blocks candidate", () => {
  const input = fixture();
  input.operation.requestOwner = "another-checkout";

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});

test("changed amount blocks candidate", () => {
  const input = fixture();
  input.operation.amountCents = 4723;

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});

test("other reservation history blocks candidate", () => {
  const input = fixture();
  input.knownHistory.source = "SharedSquarePaymentReservation";

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});

test("missing payment-history result blocks candidate", () => {
  const input = fixture();
  input.knownHistory = null;

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});

test("caller claiming verified history is not trusted", () => {
  const input = fixture();
  input.knownHistory.verified = true;
  input.knownHistory.noPriorPaymentActivity = true;

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});

test("invalid order identity blocks candidate", () => {
  const input = fixture();
  input.orderId = "invalid";

  const result = classifyV3InitializationPaymentHistoryStage(input);

  assert.equal(result.candidate, false);
  noAuthorization(result);
});