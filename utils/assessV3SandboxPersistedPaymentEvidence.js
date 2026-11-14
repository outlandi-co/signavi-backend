const idPattern = /^[a-f0-9]{24}$/;

const blocked = reason => Object.freeze({
  eligibleForTrustedReview: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Preliminary persisted-record consistency assessment.
 *
 * The caller must independently load and authenticate records
 * from the correct databases. This function does NOT establish
 * provenance and cannot authorize Square execution.
 */
export function assessV3SandboxPersistedPaymentEvidence({
  orderId,
  expectedAmountCents,
  expectedOwner,
  operation
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (!idPattern.test(id)) {
    return blocked("INVALID_ORDER_ID");
  }

  if (
    !Number.isSafeInteger(expectedAmountCents) ||
    expectedAmountCents <= 0
  ) {
    return blocked("INVALID_EXPECTED_AMOUNT");
  }

  if (
    typeof expectedOwner !== "string" ||
    !expectedOwner.trim()
  ) {
    return blocked("EXPECTED_OWNER_MISSING");
  }

  if (!operation || typeof operation !== "object") {
    return blocked("PAYMENT_OPERATION_MISSING");
  }

  if (String(operation.orderId ?? "").toLowerCase() !== id) {
    return blocked("PAYMENT_OPERATION_ORDER_MISMATCH");
  }

  if (operation.environment !== "sandbox") {
    return blocked("SANDBOX_OPERATION_REQUIRED");
  }

  if (operation.amountCents !== expectedAmountCents) {
    return blocked("PAYMENT_OPERATION_AMOUNT_MISMATCH");
  }

  if (
    operation.requestOwner !== expectedOwner ||
    !String(operation.requestOwner ?? "").trim()
  ) {
    return blocked("PAYMENT_OPERATION_OWNER_MISMATCH");
  }

  if (
    typeof operation.idempotencyKey !== "string" ||
    !operation.idempotencyKey.trim() ||
    typeof operation.checkoutReferenceId !== "string" ||
    !operation.checkoutReferenceId.trim()
  ) {
    return blocked("PAYMENT_OPERATION_IDENTITY_INCOMPLETE");
  }

  if (operation.status !== "reconciliation_required") {
    return blocked("PAYMENT_OPERATION_STATUS_UNEXPECTED");
  }

  if (
    operation.squareCreationAttemptClaimedAt !== null ||
    operation.squareIdempotencyKey != null
  ) {
    return blocked("PAYMENT_CREATION_ATTEMPT_ALREADY_CLAIMED");
  }

  if (
    String(operation.squarePaymentLinkId ?? "").trim() ||
    String(operation.squareOrderId ?? "").trim() ||
    String(operation.paymentUrl ?? "").trim()
  ) {
    return blocked("EXISTING_SQUARE_ARTIFACT_DETECTED");
  }

  return Object.freeze({
    eligibleForTrustedReview: true,
    reason: "PERSISTED_EVIDENCE_REVIEW_ELIGIBLE",
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}
