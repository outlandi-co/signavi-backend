import mongoose from "mongoose"
import Reservation from "../models/SquarePaymentCreationReservation.js"

// Isolated-test-only atomic claim.
// No Square request or production authorization.
export const claimSquarePaymentCreationAttempt = async ({
  orderId,
  environment,
  owner,
  amountCents
}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_reservation_isolated_test"
  ) {
    throw new Error("Payment attempt claim restricted to isolated tests.")
  }

  if (
    !mongoose.isValidObjectId(orderId) ||
    !["sandbox", "production"].includes(environment) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    throw new Error("Invalid payment attempt claim.")
  }

  const reservation = await Reservation.findOneAndUpdate(
    {
      orderId: new mongoose.Types.ObjectId(String(orderId)),
      environment,
      owner,
      amountCents,
      status: "reconciliation_required",
      creationAttemptClaimedAt: null,
      idempotencyKey:
        `signavi-${environment}-${String(orderId)}`
    },
    {
      $set: {
        creationAttemptClaimedAt: new Date()
      }
    },
    {
      returnDocument: "after"
    }
  ).lean()

  return Object.freeze({
    claimed: Boolean(reservation),
    squareRequestAuthorized: false,
    paymentCreated: false
  })
}