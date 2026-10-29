/**
 * Production Square payment creation remains disabled.
 *
 * This policy is intentionally fail-closed and must never
 * be treated as permission to execute a Square request.
 */
export function evaluateV3ProductionExecutionPolicy({
  environment,
  reservation,
  operation
} = {}) {
  const identityMatches =
    environment === "production" &&
    reservation?.environment === "production" &&
    operation?.environment === "production" &&
    String(reservation?.orderId || "") ===
      String(operation?.orderId || "") &&
    Boolean(reservation?.idempotencyKey) &&
    reservation.idempotencyKey === operation?.idempotencyKey

  return Object.freeze({
    authorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false,
    reason: identityMatches
      ? "PRODUCTION_EXECUTION_NOT_IMPLEMENTED"
      : "PRODUCTION_IDENTITY_NOT_VERIFIED"
  })
}