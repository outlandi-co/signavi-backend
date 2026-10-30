import {
  assessV3TrustedCheckoutOrder
} from "./assessV3TrustedCheckoutOrder.js"

const denied = (reason, httpStatus = 423) =>
  Object.freeze({
    ready: false,
    reason,
    httpStatus,
    paymentCreated: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })

/**
 * Read-only inspection for a future trusted V3 HTTP adapter.
 *
 * authorizeRequest and checkHistoricalPayment must be
 * trusted server-bound callbacks, never browser-provided.
 *
 * No reservation, payment operation, or Square execution
 * is authorized or initiated here.
 */
export async function inspectV3ProductionCheckout({
  order,
  authorizeRequest,
  checkHistoricalPayment
} = {}) {
  if (
    typeof authorizeRequest !== "function" ||
    typeof checkHistoricalPayment !== "function"
  ) {
    return denied("TRUSTED_INSPECTION_DEPENDENCIES_REQUIRED", 503)
  }

  let authorized

  try {
    authorized = await authorizeRequest(order)
  } catch {
    return denied("CHECKOUT_AUTHORIZATION_UNCERTAIN", 403)
  }

  if (authorized !== true) {
    return denied("CHECKOUT_NOT_AUTHORIZED", 403)
  }

  const eligibility = assessV3TrustedCheckoutOrder(order)

  if (eligibility?.eligible !== true) {
    return denied(
      eligibility?.reason || "ORDER_NOT_ELIGIBLE",
      409
    )
  }

  let history

  try {
    history = await checkHistoricalPayment({
      orderId: eligibility.orderId,
      amountCents: eligibility.amountCents
    })
  } catch {
    return denied("HISTORICAL_PAYMENT_CHECK_UNCERTAIN")
  }

  if (
    history?.verified !== true ||
    history?.noPriorPaymentActivity !== true
  ) {
    return denied("HISTORICAL_PAYMENT_NOT_CLEARED")
  }

  // Deliberately locked even if inspection succeeds.
  // History clearance is not Square execution permission.
  return denied("V3_PRODUCTION_EXECUTION_NOT_ACTIVATED")
}