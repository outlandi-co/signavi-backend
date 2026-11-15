import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxPersistedPaymentEvidence
} from "../utils/assessV3SandboxPersistedPaymentEvidence.js";

const orderId = "507f1f77bcf86cd799439011";
const owner = "checkout:server-owned-test";

const candidate = () => ({
  orderId,
  expectedAmountCents: 2500,
  expectedOwner: owner,
  operation: {
    orderId,
    environment: "sandbox",
    amountCents: 2500,
    requestOwner: owner,
    idempotencyKey: "server-owned-request-key",
    checkoutReferenceId: "server-owned-checkout-reference",
    status: "reconciliation_required",
    squareCreationAttemptClaimedAt: null,
    squareIdempotencyKey: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  }
});

test("consistent records qualify only for further review", () => {
  const result = assessV3SandboxPersistedPaymentEvidence(
    candidate()
  );

  assert.equal(result.eligibleForTrustedReview, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("mismatched order is rejected", () => {
  const input = candidate();
  input.operation.orderId = "507f191e810c19729de860ea";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_OPERATION_ORDER_MISMATCH"
  );
});

test("mismatched amount is rejected", () => {
  const input = candidate();
  input.operation.amountCents = 2600;

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_OPERATION_AMOUNT_MISMATCH"
  );
});

test("mismatched owner is rejected", () => {
  const input = candidate();
  input.operation.requestOwner = "different-owner";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_OPERATION_OWNER_MISMATCH"
  );
});

test("production payment operation is rejected", () => {
  const input = candidate();
  input.operation.environment = "production";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "SANDBOX_OPERATION_REQUIRED"
  );
});

test("consumed creation claim is rejected", () => {
  const input = candidate();
  input.operation.squareCreationAttemptClaimedAt = new Date();

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_CREATION_ATTEMPT_ALREADY_CLAIMED"
  );
});

test("existing Square link is rejected", () => {
  const input = candidate();
  input.operation.squarePaymentLinkId = "existing-link";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "EXISTING_SQUARE_ARTIFACT_DETECTED"
  );
});

test("missing operation identity is rejected", () => {
  const input = candidate();
  input.operation.checkoutReferenceId = "";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_OPERATION_IDENTITY_INCOMPLETE"
  );
});

test("incorrect operation status is rejected", () => {
  const input = candidate();
  input.operation.status = "completed";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_OPERATION_STATUS_UNEXPECTED"
  );
});

test("caller approval cannot authorize Square", () => {
  const input = candidate();
  input.authorized = true;
  input.squareRequestAuthorized = true;
  input.operation.squareRequestAuthorized = true;

  const result = assessV3SandboxPersistedPaymentEvidence(input);

  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("missing operation is rejected", () => {
  const input = candidate();
  delete input.operation;

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_OPERATION_MISSING"
  );
});
test("incomplete creation-claim state is rejected", () => {
  const input = candidate();
  delete input.operation.squareCreationAttemptClaimedAt;

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_CREATION_ATTEMPT_ALREADY_CLAIMED"
  );
});

test("persisted Square idempotency key blocks review", () => {
  const input = candidate();
  input.operation.squareIdempotencyKey = "sv3p-" + "a".repeat(40);

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "PAYMENT_CREATION_ATTEMPT_ALREADY_CLAIMED"
  );
});

test("existing Square order blocks review", () => {
  const input = candidate();
  input.operation.squareOrderId = "existing-square-order";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "EXISTING_SQUARE_ARTIFACT_DETECTED"
  );
});

test("existing Square payment URL blocks review", () => {
  const input = candidate();
  input.operation.paymentUrl = "https://example.invalid/payment";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "EXISTING_SQUARE_ARTIFACT_DETECTED"
  );
});

test("missing expected owner blocks review", () => {
  const input = candidate();
  input.expectedOwner = "";

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "EXPECTED_OWNER_MISSING"
  );
});

test("unsafe expected amount blocks review", () => {
  const input = candidate();
  input.expectedAmountCents = Number.MAX_SAFE_INTEGER + 1;

  assert.equal(
    assessV3SandboxPersistedPaymentEvidence(input).reason,
    "INVALID_EXPECTED_AMOUNT"
  );
});