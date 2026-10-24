import crypto from "node:crypto"
import mongoose from "mongoose"
import Reservation from "../models/SquarePaymentCreationReservation.js"

// Creates one durable reservation for an order/environment.
// A duplicate reservation is never treated as authorization.
// No automatic retries, lock expiration, or Square calls.
export const acquireSquarePaymentCreationReservation = async ({
  orderId,
  environment,
  amountCents
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    !["sandbox", "production"].includes(environment) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new Error("Invalid Square payment reservation.")
  }

  if (mongoose.connection.readyState !== 1) {
    throw new Error("Square payment reservation requires MongoDB.")
  }

  const id = new mongoose.Types.ObjectId(String(orderId))
  const owner = crypto.randomUUID()
  const idempotencyKey =
    `signavi-${environment}-${String(id)}`

  try {
    const reservation = await Reservation.create({
      orderId: id,
      environment,
      owner,
      idempotencyKey,
      amountCents,
      status: "reconciliation_required"
    })

    return Object.freeze({
      reserved: true,
      orderId: String(reservation.orderId),
      environment: reservation.environment,
      owner: reservation.owner,
      idempotencyKey: reservation.idempotencyKey,
      amountCents: reservation.amountCents,
      squareRequestAuthorized: false,
      paymentCreated: false
    })
  } catch (error) {
    if (error?.code === 11000) {
      return Object.freeze({
        reserved: false,
        reason: "payment_creation_already_reserved",
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }

    throw error
  }
}