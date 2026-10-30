/**
 * Trusted server-side V3 production activation boundary.
 *
 * Payment creation stays disabled until ownership,
 * historical reconciliation, and concurrency controls
 * are integrated and verified end to end.
 *
 * This function never returns Square authorization.
 * It has no network or database side effects.
 */
export function denyV3ProductionCheckout() {
  return Object.freeze({
    httpStatus: 423,
    body: Object.freeze({
      success: false,
      code: "V3_PRODUCTION_CHECKOUT_NOT_ACTIVATED",
      reason: "v3_production_payment_not_enabled",
      message:
        "Secure V3 production checkout is not activated.",
      paymentCreated: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  })
}