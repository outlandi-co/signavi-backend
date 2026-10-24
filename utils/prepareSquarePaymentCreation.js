import {
  acquireSquarePaymentCreationReservation
} from "./acquireSquarePaymentCreationReservation.js"

import {
  validateSquarePaymentCreationReservation
} from "./validateSquarePaymentCreationReservation.js"

// Database reservation and validation only.
// Does not authorize or execute any Square API call.
// Existing V3 operations require separate conflict isolation.
export const prepareSquarePaymentCreation = async ({
  orderId,
  environment,
  amountCents
}) => {
  const reservation =
    await acquireSquarePaymentCreationReservation({
      orderId,
      environment,
      amountCents
    })

  if (!reservation.reserved) {
    return Object.freeze({
      prepared: false,
      reason: reservation.reason ||
        "payment_creation_reservation_rejected",
      squareRequestAuthorized: false
    })
  }

  const validation =
    validateSquarePaymentCreationReservation({
      reservation,
      orderId,
      environment,
      amountCents
    })

  if (!validation.valid) {
    // The reservation may already be persisted.
    // Never release it or retry automatically.
    throw new Error(
      "Persisted Square reservation failed validation; " +
      "manual reconciliation required."
    )
  }

  return Object.freeze({
    prepared: true,
    orderId: validation.orderId,
    environment: validation.environment,
    amountCents: validation.amountCents,
    idempotencyKey: reservation.idempotencyKey,
    owner: reservation.owner,
    squareRequestAuthorized: false,
    paymentCreated: false
  })
}