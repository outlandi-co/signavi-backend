import {
  inspectV3ProductionCheckoutExecution
} from "./v3ProductionCheckoutExecutionBoundary.js"

/**
 * Checkout decision only.
 *
 * No Square SDK calls.
 * No MongoDB writes.
 * Never authorizes a payment retry.
 */
export function decideV3ProductionCheckout({
  reservation,
  operation
} = {}) {
  const inspection = inspectV3ProductionCheckoutExecution({
    reservation,
    operation
  })

  if (inspection.eligibleForExecutionReview) {
    return Object.freeze({
      status: 423,
      action: "trusted_execution_required",
      reason: inspection.reason,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  }

  if (inspection.reason === "PAYMENT_ALREADY_COMPLETED") {
    return Object.freeze({
      status: 409,
      action: "already_completed",
      reason: inspection.reason,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  }

  return Object.freeze({
    status: 423,
    action: "hold_for_reconciliation",
    reason: inspection.reason,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })
}