/**
 * Non-executing production checkout decision boundary.
 *
 * This module never creates Square payments. It only
 * describes whether claimed payment state is consistent.
 *
 * A positive decision is NOT authorization for an SDK call.
 */
export function inspectV3ProductionCheckoutExecution({
  reservation,
  operation
} = {}) {
  const blocked = reason => Object.freeze({
    eligibleForExecutionReview: false,
    squareRequestAuthorized: false,
    retryAuthorized: false,
    reason
  })

  if (
    reservation?.environment !== "production" ||
    operation?.environment !== "production"
  ) {
    return blocked("PRODUCTION_IDENTITY_REQUIRED")
  }

  const orderId = String(reservation.orderId || "")
  const key = `signavi-v3-production-purchase-${orderId}`

  if (
    !/^[0-9a-f]{24}$/.test(orderId) ||
    reservation.purchaseKey !== key ||
    reservation.idempotencyKey !== key ||
    String(operation.orderId || "") !== orderId ||
    operation.idempotencyKey !== key
  ) {
    return blocked("PURCHASE_IDENTITY_MISMATCH")
  }

  if (
    reservation.status === "reconciliation_required" ||
    operation.status === "reconciliation_required"
  ) {
    return blocked("RECONCILIATION_REQUIRED")
  }

  if (reservation.status === "completed") {
    return blocked("PAYMENT_ALREADY_COMPLETED")
  }

  if (
    reservation.status !== "claim_pending" ||
    !reservation.attemptClaimedAt
  ) {
    return blocked("DURABLE_CLAIM_REQUIRED")
  }

  return Object.freeze({
    eligibleForExecutionReview: true,
    squareRequestAuthorized: false,
    retryAuthorized: false,
    reason: "CLAIM_REQUIRES_TRUSTED_EXECUTOR"
  })
}