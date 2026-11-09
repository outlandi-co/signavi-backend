
import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyV3PendingOperationResume
} from "../utils/verifyV3PendingOperationResume.js";

const id = "6aec6ff81538ade490af0a5b";
const now = new Date("2026-11-06T12:00:00Z");

function fixture() {
  return {
    orderId: id,
    now,
    lock: {
      orderId: id,
      owner: "test-owned-lock",
      expiresAt: new Date(now.getTime() + 60000)
    },
    order: {
      _id: id,
      status: "payment_required",
      paymentStatus: "unpaid",
      squareEnvironment: "sandbox",
      squareExpectedAmountCents: 4722,
      squarePaymentId: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      paidAt: null
    },
    operation: {
      orderId: id,
      environment: "sandbox",
      status: "pending",
      requestOwner: "",
      amountCents: 4722,
      idempotencyKey: "signavi-v3-sandbox-test",
      checkoutReferenceId: "checkout-test-reference",
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: "",
      squarePaymentId: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      squareDiagnostic: null,
      lastError: ""
    }
  };
}

test("pristine operation remains candidate-only", () => {
  const result = verifyV3PendingOperationResume(fixture());

  assert.equal(result.eligible, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.paymentCreated, false);
});

test("existing Square payment ID blocks resume", () => {
  const input = fixture();
  input.operation.squarePaymentId = "square-payment-existing";

  const result = verifyV3PendingOperationResume(input);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PAYMENT_CREATION_EVIDENCE_PRESENT");
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("claimed creation still blocks resume", () => {
  const input = fixture();
  input.operation.squareCreationAttemptClaimedAt = now;

  const result = verifyV3PendingOperationResume(input);

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("expired lock still blocks resume", () => {
  const input = fixture();
  input.lock.expiresAt = new Date(now.getTime() - 1000);

  const result = verifyV3PendingOperationResume(input);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "ACTIVE_OWNED_LOCK_REQUIRED");
});
