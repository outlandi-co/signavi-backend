import {
  assessV3ProductionPurchaseRecovery
} from "./assessV3ProductionPurchaseRecovery.js"

const idPattern = /^[0-9a-f]{24}$/i

export function verifyV3ProductionPaymentAlignment({
  reservation,
  operation
}) {
  const hold = reason => Object.freeze({
    aligned: false,
    reason,
    squareCreationAuthorized: false,
    retryAuthorized: false,
    databaseWriteAuthorized: false
  })

  if (!reservation || !operation) {
    return hold("BOTH_RECORDS_REQUIRED")
  }

  const orderId = String(reservation.orderId ?? "").toLowerCase()
  const operationOrderId =
    String(operation.orderId ?? "").toLowerCase()

  if (!idPattern.test(orderId)) {
    return hold("INVALID_ORDER_ID")
  }

  const expectedKey =
    `signavi-v3-production-purchase-${orderId}`

  if (
    reservation.environment !== "production" ||
    operation.environment !== "production"
  ) {
    return hold("PRODUCTION_ENVIRONMENT_REQUIRED")
  }

  if (orderId !== operationOrderId) {
    return hold("ORDER_ID_MISMATCH")
  }

  if (
    reservation.purchaseKey !== expectedKey ||
    reservation.idempotencyKey !== expectedKey ||
    operation.idempotencyKey !== expectedKey
  ) {
    return hold("PAYMENT_IDENTITY_MISMATCH")
  }

  const validReservationStates = new Set([
    "reserved",
    "claim_pending",
    "reconciliation_required",
    "completed"
  ])

  const validOperationStates = new Set([
    "pending",
    "reconciliation_required",
    "completed"
  ])

  if (
    !validReservationStates.has(reservation.status) ||
    !validOperationStates.has(operation.status)
  ) {
    return hold("UNRECOGNIZED_PAYMENT_STATE")
  }

  // A reservation already claimed or completed cannot
  // be treated as a fresh purchase.
  const recovery = assessV3ProductionPurchaseRecovery({
    reservation,
    operation
  })

  if (
    reservation.status === "reserved" &&
    reservation.attemptClaimedAt == null &&
    operation.status === "pending" &&
    operation.squareCreationAttemptClaimedAt == null
  ) {
    return Object.freeze({
      aligned: true,
      state: "unclaimed",
      reason: "INITIAL_IDENTITIES_ALIGNED",
      purchaseKey: expectedKey,
      squareCreationAuthorized: false,
      retryAuthorized: false,
      databaseWriteAuthorized: false
    })
  }

  return Object.freeze({
    aligned: true,
    state: "reconciliation_hold",
    reason: recovery.reason,
    purchaseKey: expectedKey,
    squareCreationAuthorized: false,
    retryAuthorized: false,
    databaseWriteAuthorized: false
  })
}
