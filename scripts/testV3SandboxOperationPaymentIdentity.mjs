
import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxInitialization
} from "../utils/assessV3SandboxInitialization.js";

const id = "6aec6ff81538ade490af0a5b";

function fixture() {
  return {
    storefrontOrder: {
      _id: id,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      currency: "USD",
      squareEnvironment: "sandbox",
      squareExpectedAmountCents: 4722,
      squarePaymentId: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: ""
    },
    storefrontOperation: {
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
    },
    sandboxOrder: null,
    sandboxOperation: null
  };
}

test("unstarted operation is only an initialization candidate", () => {
  const result = assessV3SandboxInitialization(fixture());

  assert.equal(result.eligible, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("operation with Square payment ID is rejected", () => {
  const input = fixture();
  input.storefrontOperation.squarePaymentId = "square-payment-123";

  const result = assessV3SandboxInitialization(input);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PAYMENT_CREATION_EVIDENCE_PRESENT");
  assert.equal(result.squareRequestAuthorized, false);
});

test("claimed Square creation remains rejected", () => {
  const input = fixture();
  input.storefrontOperation.squareCreationAttemptClaimedAt = new Date();

  const result = assessV3SandboxInitialization(input);

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("existing isolated operation remains rejected", () => {
  const input = fixture();
  input.sandboxOperation = { orderId: id };

  const result = assessV3SandboxInitialization(input);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "SANDBOX_RECORD_ALREADY_EXISTS");
});

test("mismatched amount remains rejected", () => {
  const input = fixture();
  input.storefrontOperation.amountCents = 4723;

  const result = assessV3SandboxInitialization(input);

  assert.equal(result.eligible, false);
  assert.equal(result.squareRequestAuthorized, false);
});
