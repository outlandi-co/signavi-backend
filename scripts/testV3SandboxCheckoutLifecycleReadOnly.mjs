import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxCheckoutLifecycleReadOnly as assess
} from "../utils/assessV3SandboxCheckoutLifecycleReadOnly.js";

const id = "507f1f77bcf86cd799439011";
const owner = "server-generated-attempt-owner";
const expires = new Date("2030-01-01T00:00:00Z");

function candidate(stage = "pre_lock") {
  const locked = stage !== "pre_lock";

  return {
    stage,
    orderId: id,
    now: new Date("2026-11-14T00:00:00Z"),
    storefrontOrder: {
      _id: id,
      squareExpectedAmountCents: 2500
    },
    prepared: {
      orderId: id,
      totalCents: 2500
    },
    operation: {
      orderId: id,
      environment: "sandbox",
      amountCents: 2500,
      idempotencyKey: "signavi-v3-sandbox-test-123",
      checkoutReferenceId: "test-reference",
      status: stage === "post_reservation"
        ? "reconciliation_required"
        : "pending",
      requestOwner: stage === "post_reservation"
        ? owner
        : "",
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: null,
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: ""
    },
    acquiredLock: locked
      ? { orderId: id, owner, expiresAt: new Date(expires) }
      : null,
    persistedLock: locked
      ? { _id: id, owner, expiresAt: new Date(expires) }
      : null
  };
}

for (const stage of [
  "pre_lock",
  "lock_acquired",
  "post_reservation"
]) {
  test(`${stage} remains review-only`, () => {
    const result = assess(candidate(stage));

    assert.equal(result.eligibleForReview, true);
    assert.equal(result.stage, stage);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  });
}

test("pre-lock rejects supplied lock", () => {
  const input = candidate();
  input.acquiredLock = {
    orderId: id,
    owner,
    expiresAt: new Date(expires)
  };

  assert.equal(
    assess(input).reason,
    "PRELOCK_CANNOT_ASSERT_LOCK_OWNERSHIP"
  );
});

test("post-lock rejects missing acquired lock", () => {
  const input = candidate("lock_acquired");
  input.acquiredLock = null;

  assert.equal(assess(input).eligibleForReview, false);
});

test("post-lock rejects different owner", () => {
  const input = candidate("lock_acquired");
  input.persistedLock.owner = "other-attempt";

  assert.equal(
    assess(input).reason,
    "CHECKOUT_LOCK_ATTEMPT_MISMATCH"
  );
});

test("post-lock rejects expired lock", () => {
  const input = candidate("lock_acquired");
  input.persistedLock.expiresAt =
    new Date("2020-01-01T00:00:00Z");

  assert.equal(assess(input).eligibleForReview, false);
});

test("pre-lock rejects reserved operation", () => {
  const input = candidate();
  input.operation.status = "reconciliation_required";
  input.operation.requestOwner = owner;

  assert.equal(assess(input).eligibleForReview, false);
});

test("post-reservation rejects pending operation", () => {
  const input = candidate("post_reservation");
  input.operation.status = "pending";
  input.operation.requestOwner = "";

  assert.equal(
    assess(input).reason,
    "POSTRESERVATION_OPERATION_NOT_RESERVED"
  );
});

test("post-reservation rejects wrong operation owner", () => {
  const input = candidate("post_reservation");
  input.operation.requestOwner = "other-attempt";

  assert.equal(assess(input).eligibleForReview, false);
});

test("prior Square creation claim is rejected in all stages", () => {
  for (const stage of [
    "pre_lock",
    "lock_acquired",
    "post_reservation"
  ]) {
    const input = candidate(stage);
    input.operation.squareCreationAttemptClaimedAt = new Date();

    assert.equal(
      assess(input).eligibleForReview,
      false,
      stage
    );
  }
});

test("existing Square artifact is rejected", () => {
  const input = candidate("post_reservation");
  input.operation.squarePaymentLinkId = "existing-link";

  assert.equal(assess(input).eligibleForReview, false);
});

test("mismatched Store amount is rejected", () => {
  const input = candidate("post_reservation");
  input.prepared.totalCents = 2600;

  assert.equal(
    assess(input).reason,
    "STORE_CHECKOUT_AMOUNT_NOT_VERIFIED"
  );
});

test("invalid checkout stage is rejected", () => {
  const input = candidate();
  input.stage = "payment_authorized";

  assert.equal(
    assess(input).reason,
    "UNKNOWN_LIFECYCLE_STAGE"
  );
});

test("forged approval flags never authorize Square", () => {
  const input = candidate("post_reservation");
  input.approved = true;
  input.squareRequestAuthorized = true;
  input.operation.squareRequestAuthorized = true;

  const result = assess(input);

  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("missing operation fails closed", () => {
  const input = candidate();
  input.operation = null;

  assert.equal(assess(input).eligibleForReview, false);
});
