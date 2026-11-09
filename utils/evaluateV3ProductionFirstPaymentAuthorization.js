const blocked = reason => Object.freeze({
  authorized: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

const objectIdPattern = /^[0-9a-f]{24}$/

export function evaluateV3ProductionFirstPaymentAuthorization({
  orderId,
  eligibility,
  knownHistory,
  externalHistory,
  sharedFence
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (!objectIdPattern.test(id)) {
    return blocked("INVALID_ORDER_ID")
  }

  if (eligibility?.eligible !== true) {
    return blocked("FIRST_ATTEMPT_NOT_ELIGIBLE")
  }

  if (knownHistory?.knownRecordsClear !== true) {
    return blocked("KNOWN_PAYMENT_HISTORY_NOT_CLEARED")
  }

  if (
    externalHistory?.conflicting === true ||
    externalHistory?.identityMismatch === true ||
    externalHistory?.existingPayment === true ||
    externalHistory?.existingLink === true
  ) {
    return blocked("EXTERNAL_PAYMENT_ACTIVITY_DETECTED")
  }

  if (
    externalHistory?.complete !== true ||
    externalHistory?.authoritativeNoPriorActivity !== true
  ) {
    return blocked("EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED")
  }

  if (
    sharedFence?.reserved !== true ||
    sharedFence?.orderId !== id ||
    sharedFence?.environment !== "production" ||
    sharedFence?.idempotencyKey !== `signavi-production-${id}`
  ) {
    return blocked("SHARED_FENCE_NOT_VERIFIED")
  }

  // This policy does not itself authorize Square creation.
  // External clearance and final transactional ownership
  // must be independently verified by trusted services.
  return blocked("TRUSTED_EXECUTION_AUTHORIZATION_NOT_IMPLEMENTED")
}