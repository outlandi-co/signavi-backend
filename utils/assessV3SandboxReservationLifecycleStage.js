const OBJECT_ID = /^[0-9a-f]{24}$/;

const deny = reason => Object.freeze({
  eligibleForReview: false,
  reason,
  stage: "blocked",
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Classifies persisted operation state before or after
 * reservation. It never grants Square execution authority.
 *
 * Input provenance is NOT established by this pure function.
 * Only a server-owned coordinator may supply verified data.
 */
export function assessV3SandboxReservationLifecycleStage({
  orderId,
  amountCents,
  expectedOwner,
  operation
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (
    !OBJECT_ID.test(id) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    return deny("INVALID_CHECKOUT_IDENTITY_OR_AMOUNT");
  }

  if (
    !operation ||
    String(operation.orderId ?? "").toLowerCase() !== id ||
    operation.environment !== "sandbox" ||
    operation.amountCents !== amountCents ||
    typeof operation.idempotencyKey !== "string" ||
    !operation.idempotencyKey.startsWith("signavi-v3-sandbox-") ||
    typeof operation.checkoutReferenceId !== "string" ||
    !operation.checkoutReferenceId.trim()
  ) {
    return deny("PAYMENT_OPERATION_IDENTITY_MISMATCH");
  }

  if (
    operation.squareCreationAttemptClaimedAt !== null ||
    operation.squareIdempotencyKey != null ||
    operation.squarePaymentLinkId !== "" ||
    operation.squareOrderId !== "" ||
    operation.paymentUrl !== ""
  ) {
    return deny("EXISTING_OR_UNCERTAIN_SQUARE_ATTEMPT");
  }

  if (
    operation.status === "pending" &&
    operation.requestOwner === ""
  ) {
    return Object.freeze({
      eligibleForReview: true,
      stage: "before_reservation",
      reason: "UNCLAIMED_PENDING_OPERATION",
      squareRequestAuthorized: false,
      retryAuthorized: false
    });
  }

  if (
    operation.status === "reconciliation_required" &&
    typeof expectedOwner === "string" &&
    expectedOwner.trim() &&
    operation.requestOwner === expectedOwner
  ) {
    return Object.freeze({
      eligibleForReview: true,
      stage: "after_reservation",
      reason: "RESERVED_OPERATION_REQUIRES_HISTORY_REVIEW",
      squareRequestAuthorized: false,
      retryAuthorized: false
    });
  }

  return deny("RESERVATION_STATE_OR_OWNER_MISMATCH");
}
