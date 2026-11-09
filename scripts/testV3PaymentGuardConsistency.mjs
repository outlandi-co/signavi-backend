import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxInitialization
} from "../utils/assessV3SandboxInitialization.js";

import {
  verifyV3PendingOperationResume
} from "../utils/verifyV3PendingOperationResume.js";

const id = "6aec6ff81538ade490af0a5b";
const now = new Date("2026-11-06T12:00:00Z");

function fixture() {
  const order = {
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
    paymentUrl: "",
    paidAt: null
  };

  const operation = {
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
  };

  return {
    orderId: id,
    now,
    lock: {
      orderId: id,
      owner: "test-owned-lock",
      expiresAt: new Date(now.getTime() + 60000)
    },
    order,
    operation
  };
}

function compare(input) {
  const initialization = assessV3SandboxInitialization({
    storefrontOrder: input.order,
    storefrontOperation: input.operation,
    sandboxOrder: null,
    sandboxOperation: null
  });

  const resume = verifyV3PendingOperationResume(input);

  return { initialization, resume };
}

test("pristine operation remains candidate-only in both paths", () => {
  const { initialization, resume } = compare(fixture());

  assert.equal(initialization.eligible, true);
  assert.equal(resume.eligible, true);

  for (const result of [initialization, resume]) {
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  }
});

const paymentEvidence = [
  ["squareCreationAttemptClaimedAt", new Date(now)],
  ["squareIdempotencyKey", "square-request-key"],
  ["squarePaymentId", "existing-payment"],
  ["squarePaymentLinkId", "existing-link"],
  ["squareOrderId", "existing-square-order"],
  ["paymentUrl", "https://example.invalid/payment"],
  ["squareDiagnostic", { code: "uncertain" }],
  ["lastError", "unknown payment outcome"]
];

for (const [field, value] of paymentEvidence) {
  test(`${field} blocks both checkout pathways`, () => {
    const input = fixture();
    input.operation[field] = value;

    const { initialization, resume } = compare(input);

    for (const result of [initialization, resume]) {
      assert.equal(result.eligible, false, field);
      assert.equal(result.squareRequestAuthorized, false);
      assert.equal(result.retryAuthorized, false);
    }
  });
}

test("existing request owner blocks both pathways", () => {
  const input = fixture();
  input.operation.requestOwner = "another-checkout";

  const { initialization, resume } = compare(input);

  assert.equal(initialization.eligible, false);
  assert.equal(resume.eligible, false);
});

test("changed amount blocks both pathways", () => {
  const input = fixture();
  input.operation.amountCents = 4723;

  const { initialization, resume } = compare(input);

  assert.equal(initialization.eligible, false);
  assert.equal(resume.eligible, false);
});

test("existing order payment blocks both pathways", () => {
  const input = fixture();
  input.order.squarePaymentId = "existing-payment";

  const { initialization, resume } = compare(input);

  assert.equal(initialization.eligible, false);
  assert.equal(resume.eligible, false);
});