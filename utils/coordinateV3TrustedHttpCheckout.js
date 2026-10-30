import {
  prepareV3TrustedHttpCheckout
} from "./prepareV3TrustedHttpCheckout.js"

import {
  initializeV3ProductionCheckoutAtomic
} from "./initializeV3ProductionCheckoutAtomic.js"

/**
 * Trusted V3 production checkout preparation coordinator.
 *
 * This coordinator is intentionally NOT authorized to create
 * Square payment links.
 *
 * All dependencies must be provided by trusted server code.
 * Browser input must never provide repository or authorization callbacks.
 */
export function createV3TrustedHttpCheckoutCoordinator({
  Reservation,
  PaymentOperation,
  startSession,
  authorizeRequest,
  checkHistoricalPayment
} = {}) {
  const dependenciesValid =
    typeof Reservation?.create === "function" &&
    typeof Reservation?.findOne === "function" &&
    typeof PaymentOperation?.create === "function" &&
    typeof PaymentOperation?.findOne === "function" &&
    typeof startSession === "function" &&
    typeof authorizeRequest === "function" &&
    typeof checkHistoricalPayment === "function"

  return async function coordinateCheckout({ order } = {}) {
    if (!dependenciesValid) {
      return Object.freeze({
        ready: false,
        reason: "TRUSTED_COORDINATOR_DEPENDENCIES_REQUIRED",
        httpStatus: 503,
        squareRequestAuthorized: false
      })
    }

    return prepareV3TrustedHttpCheckout({
      order,
      authorizeRequest,
      checkHistoricalPayment,

      initializeCheckout: ({ orderId, amountCents }) =>
        initializeV3ProductionCheckoutAtomic({
          Reservation,
          PaymentOperation,
          startSession,
          orderId,
          amountCents
        })
    })
  }
}