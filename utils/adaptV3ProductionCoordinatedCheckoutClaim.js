/**
 * Maps a coordinated claim result to a checkout decision.
 *
 * The existing isolated coordinator never authorizes
 * production Square execution. Preserve that boundary.
 *
 * This adapter performs no database or Square operations.
 */
export function adaptV3ProductionCoordinatedCheckoutClaim({
  identity,
  coordinatedClaim
} = {}) {
  const blocked = reason => Object.freeze({
    claimed: false,
    blocked: true,
    reason,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })

  const orderId = String(identity?.orderId || "").toLowerCase()
  const purchaseKey =
    `signavi-v3-production-purchase-${orderId}`

  if (
    !/^[0-9a-f]{24}$/.test(orderId) ||
    identity?.environment !== "production" ||
    identity?.purchaseKey !== purchaseKey ||
    identity?.idempotencyKey !== purchaseKey ||
    typeof identity?.owner !== "string" ||
    !identity.owner.trim()
  ) {
    return blocked("INVALID_CHECKOUT_IDENTITY")
  }

  if (
    coordinatedClaim?.coordinated !== true ||
    coordinatedClaim?.blocked !== false ||
    coordinatedClaim?.purchaseKey !== purchaseKey
  ) {
    return blocked("COORDINATED_CLAIM_NOT_VERIFIED")
  }

  if (
    coordinatedClaim.squareCreationAuthorized !== false ||
    coordinatedClaim.retryAuthorized !== false
  ) {
    return blocked("UNEXPECTED_EXECUTION_AUTHORIZATION")
  }

  return blocked("TRUSTED_PRODUCTION_EXECUTOR_REQUIRED")
}