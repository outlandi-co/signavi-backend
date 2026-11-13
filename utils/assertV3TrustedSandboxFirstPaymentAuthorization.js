/**
 * Trusted V3 sandbox first-payment execution boundary.
 *
 * This guard deliberately rejects all execution until
 * independently verified, server-owned authorization
 * and reconciliation evidence are connected.
 *
 * No caller-supplied flag or observed empty Square
 * history may authorize a payment.
 *
 * Do not bypass this function in trusted execution.
 */
export function assertV3TrustedSandboxFirstPaymentAuthorization() {
  throw new Error(
    "V3_TRUSTED_FIRST_PAYMENT_AUTHORIZATION_NOT_CONNECTED"
  )
}
