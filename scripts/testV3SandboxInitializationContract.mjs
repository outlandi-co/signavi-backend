import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyV3PendingOperationResume
} from "../utils/verifyV3PendingOperationResume.js";

const orderId = "507f1f77bcf86cd799439011";

const makeEvidence = () => ({
  orderId,
  now: new Date("2026-11-05T12:00:00Z"),
  lock: {
    orderId,
    owner: "trusted-owner",
    expiresAt: new Date("2026-11-05T12:02:00Z")
  },
  order: {
    _id: orderId,
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
    orderId,
    environment: "sandbox",
    status: "pending",
    requestOwner: "",
    amountCents: 4722,
    idempotencyKey: "signavi-v3-sandbox-existing-operation",
    checkoutReferenceId: "existing-reference",
    squareCreationAttemptClaimedAt: null,
    squareIdempotencyKey: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: "",
    squareDiagnostic: null,
    lastError: ""
  }
});

test("existing pending operation remains eligible for safe reuse", () => {
  const evidence = makeEvidence();

  const result = verifyV3PendingOperationResume(evidence);

  assert.equal(result.eligible, true);
  assert.equal(result.reason, "PENDING_OPERATION_REUSE_ELIGIBLE");
  assert.equal(result.amountCents, 4722);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("payment creation claim blocks reuse", () => {
  const evidence = makeEvidence();

  evidence.operation.squareCreationAttemptClaimedAt =
    new Date("2026-11-05T12:00:30Z");

  const result = verifyV3PendingOperationResume(evidence);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PAYMENT_CREATION_EVIDENCE_PRESENT");
});

test("changed payment amount blocks reuse", () => {
  const evidence = makeEvidence();

  evidence.operation.amountCents = 5000;

  const result = verifyV3PendingOperationResume(evidence);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PENDING_OPERATION_IDENTITY_MISMATCH");
});

test("existing Square link blocks reuse", () => {
  const evidence = makeEvidence();

  evidence.operation.squarePaymentLinkId = "existing-link";

  const result = verifyV3PendingOperationResume(evidence);

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PAYMENT_CREATION_EVIDENCE_PRESENT");
});