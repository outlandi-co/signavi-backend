const blocked = reason => Object.freeze({
  eligibleForClaim: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

export function evaluateV3FirstPaymentClaim({
  orderId,
  environment,
  firstAttempt,
  knownHistory,
  reservation
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (!/^[0-9a-f]{24}$/.test(id)) {
    return blocked("INVALID_ORDER_ID")
  }

  if (environment !== "production") {
    return blocked("PRODUCTION_ENVIRONMENT_REQUIRED")
  }

  if (firstAttempt?.eligible !== true) {
    return blocked("FIRST_ATTEMPT_NOT_VERIFIED")
  }

  if (knownHistory?.knownRecordsClear !== true) {
    return blocked("KNOWN_HISTORY_NOT_CLEARED")
  }

  if (
    reservation?.reserved !== true ||
    reservation?.orderId !== id ||
    reservation?.environment !== "production" ||
    reservation?.idempotencyKey !== `signavi-production-${id}` ||
    typeof reservation?.owner !== "string" ||
    !reservation.owner.trim()
  ) {
    return blocked("RESERVATION_OWNERSHIP_NOT_VERIFIED")
  }

  // A valid reservation is not sufficient to prove
  // external history or authorize a Square request.
  return Object.freeze({
    eligibleForClaim: true,
    reason: "STRUCTURAL_CLAIM_ELIGIBILITY_ONLY",
    orderId: id,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })
}