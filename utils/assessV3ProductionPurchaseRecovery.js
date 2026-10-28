/**
 * Read-only production V3 recovery assessment.
 *
 * Never authorizes Square creation, claim resets,
 * retries, or payment-status changes.
 */

const objectIdPattern = /^[0-9a-f]{24}$/

export function assessV3ProductionPurchaseRecovery({
  reservation,
  operation
}) {
  if (!reservation || typeof reservation !== "object") {
    throw new Error("RESERVATION_REQUIRED")
  }

  if (reservation.environment !== "production") {
    throw new Error("PRODUCTION_RESERVATION_REQUIRED")
  }

  const orderId = String(reservation.orderId || "").toLowerCase()

  if (!objectIdPattern.test(orderId)) {
    throw new Error("INVALID_RESERVATION_ORDER")
  }

  const purchaseKey =
    `signavi-v3-production-purchase-${orderId}`

  if (
    reservation.purchaseKey !== purchaseKey ||
    reservation.idempotencyKey !== purchaseKey
  ) {
    throw new Error("RESERVATION_IDENTITY_MISMATCH")
  }

  const status = reservation.status
  const claimed = reservation.attemptClaimedAt != null

  const hold = reason => Object.freeze({
    action: "hold_for_reconciliation",
    reason,
    purchaseKey,
    squareCreationAuthorized: false,
    retryAuthorized: false,
    databaseWriteAuthorized: false
  })

  if (status === "completed") {
    return Object.freeze({
      action: "already_completed",
      reason: "RESERVATION_COMPLETED",
      purchaseKey,
      squareCreationAuthorized: false,
      retryAuthorized: false,
      databaseWriteAuthorized: false
    })
  }

  if (status === "reconciliation_required") {
    return hold("RECONCILIATION_REQUIRED")
  }

  if (status === "claim_pending" || claimed) {
    return hold("ATTEMPT_OUTCOME_UNCERTAIN")
  }

  if (status !== "reserved") {
    return hold("UNKNOWN_RESERVATION_STATE")
  }

  // The operation must be absent or verified. An unclaimed
  // reservation alone does not grant payment authorization.
  if (operation != null) {
    if (
      operation.environment !== "production" ||
      String(operation.orderId || "").toLowerCase() !== orderId ||
      operation.idempotencyKey !== purchaseKey
    ) {
      return hold("OPERATION_IDENTITY_MISMATCH")
    }

    return hold("EXISTING_PAYMENT_OPERATION")
  }

  return Object.freeze({
    action: "eligible_for_initial_claim_review",
    reason: "UNCLAIMED_RESERVATION",
    purchaseKey,
    squareCreationAuthorized: false,
    retryAuthorized: false,
    databaseWriteAuthorized: false
  })
}
