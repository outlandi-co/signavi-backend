import {
  assessV3TrustedCheckoutOrder
} from "./assessV3TrustedCheckoutOrder.js"

const denied = (reason, httpStatus = 423) => Object.freeze({
  ready: false,
  reason,
  httpStatus,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

/**
 * Server-side HTTP preflight only.
 *
 * This does not authorize Square execution.
 * Callbacks must be bound by trusted server code,
 * never supplied by the browser.
 *
 * checkHistoricalPayment must examine all relevant
 * historical payment sources and fail closed on uncertainty.
 */
export async function prepareV3TrustedHttpCheckout({
  order,
  authorizeRequest,
  checkHistoricalPayment,
  initializeCheckout
} = {}) {
  if (
    typeof authorizeRequest !== "function" ||
    typeof checkHistoricalPayment !== "function" ||
    typeof initializeCheckout !== "function"
  ) {
    return denied("TRUSTED_HTTP_DEPENDENCIES_REQUIRED", 503)
  }

  // Request authorization must execute before any new
  // payment-related database mutation.
  let authorized = false

  try {
    authorized = await authorizeRequest(order)
  } catch {
    return denied("CHECKOUT_AUTHORIZATION_UNCERTAIN", 403)
  }

  if (authorized !== true) {
    return denied("CHECKOUT_NOT_AUTHORIZED", 403)
  }

  const eligibility = assessV3TrustedCheckoutOrder(order)

  if (!eligibility.eligible) {
    return denied(eligibility.reason, 409)
  }

  const { orderId, amountCents } = eligibility

  // Historical Square activity is distinct from fields
  // currently saved on the Order document.
  let historical

  try {
    historical = await checkHistoricalPayment({
      orderId,
      amountCents
    })
  } catch {
    return denied("HISTORICAL_PAYMENT_CHECK_UNCERTAIN", 423)
  }

  // Only an explicit, verified no-activity result is accepted.
  if (
    historical?.verified !== true ||
    historical?.noPriorPaymentActivity !== true
  ) {
    return denied("HISTORICAL_PAYMENT_NOT_CLEARED", 423)
  }

  let initialized

  try {
    initialized = await initializeCheckout({
      orderId,
      amountCents
    })
  } catch {
    return denied("CHECKOUT_INITIALIZATION_UNCERTAIN", 423)
  }

  if (
    initialized?.prepared !== true ||
    initialized.orderId !== orderId ||
    initialized.purchaseKey !==
      `signavi-v3-production-purchase-${orderId}`
  ) {
    return denied("CHECKOUT_INITIALIZATION_NOT_VERIFIED", 423)
  }

  return Object.freeze({
    ready: true,
    orderId,
    amountCents,
    purchaseKey: initialized.purchaseKey,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })
}