import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxReservationLifecycleStage as assess
} from "../utils/assessV3SandboxReservationLifecycleStage.js";

const id = "507f1f77bcf86cd799439011";
const owner = "server-generated-lock-owner";

function candidate() {
  return {
    orderId: id,
    amountCents: 2500,
    expectedOwner: owner,
    operation: {
      orderId: id,
      environment: "sandbox",
      amountCents: 2500,
      idempotencyKey: "signavi-v3-sandbox-test-123",
      checkoutReferenceId: "checkout-reference",
      status: "pending",
      requestOwner: "",
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: null,
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: ""
    }
  };
}

test("pending operation is review-only", () => {
  const result = assess(candidate());
  assert.equal(result.stage, "before_reservation");
  assert.equal(result.eligibleForReview, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("reserved operation is review-only", () => {
  const input = candidate();
  input.operation.status = "reconciliation_required";
  input.operation.requestOwner = owner;

  const result = assess(input);
  assert.equal(result.stage, "after_reservation");
  assert.equal(result.eligibleForReview, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("reserved operation with wrong owner is denied", () => {
  const input = candidate();
  input.operation.status = "reconciliation_required";
  input.operation.requestOwner = "different-owner";

  assert.equal(
    assess(input).reason,
    "RESERVATION_STATE_OR_OWNER_MISMATCH"
  );
});

test("pending operation with nonempty owner is denied", () => {
  const input = candidate();
  input.operation.requestOwner = owner;

  assert.equal(
    assess(input).eligibleForReview,
    false
  );
});

test("claimed Square attempt is denied", () => {
  const input = candidate();
  input.operation.squareCreationAttemptClaimedAt = new Date();

  assert.equal(
    assess(input).reason,
    "EXISTING_OR_UNCERTAIN_SQUARE_ATTEMPT"
  );
});

test("existing Square artifact is denied", () => {
  const input = candidate();
  input.operation.squarePaymentLinkId = "existing-link";

  assert.equal(
    assess(input).eligibleForReview,
    false
  );
});

test("persisted Square idempotency key is denied", () => {
  const input = candidate();
  input.operation.squareIdempotencyKey = "existing-key";

  assert.equal(
    assess(input).eligibleForReview,
    false
  );
});

test("different order is denied", () => {
  const input = candidate();
  input.operation.orderId = "507f191e810c19729de860ea";

  assert.equal(
    assess(input).reason,
    "PAYMENT_OPERATION_IDENTITY_MISMATCH"
  );
});

test("amount mismatch is denied", () => {
  const input = candidate();
  input.operation.amountCents = 2501;

  assert.equal(
    assess(input).eligibleForReview,
    false
  );
});

test("unexpected status is denied", () => {
  const input = candidate();
  input.operation.status = "completed";

  assert.equal(
    assess(input).eligibleForReview,
    false
  );
});

test("caller approval flags never authorize Square", () => {
  const input = candidate();
  input.approved = true;
  input.operation.squareRequestAuthorized = true;

  const result = assess(input);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("missing operation is denied", () => {
  const input = candidate();
  input.operation = null;

  assert.equal(
    assess(input).eligibleForReview,
    false
  );
});
