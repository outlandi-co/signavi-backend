import mongoose from "mongoose"
import Reservation from "../models/SharedSquarePaymentReservation.js"

// Isolated testing only.
// Does not authorize Square creation or reset consumed claims.

export const claimSharedSquarePaymentAttempt = async ({
  documentType,
  documentId,
  environment,
  owner,
  idempotencyKey,
  amountCents
}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_reservation_isolated_test"
  ) {
    throw new Error("Shared payment claim restricted to isolated tests.")
  }

  if (
    !["order", "invoice"].includes(documentType) ||
    !mongoose.isValidObjectId(documentId) ||
    !["sandbox", "production"].includes(environment) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    typeof idempotencyKey !== "string" ||
    !idempotencyKey.trim() ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    throw new Error("Invalid shared payment claim.")
  }

  const record = await Reservation.findOneAndUpdate(
    {
      documentType,
      documentId: new mongoose.Types.ObjectId(documentId),
      environment,
      owner,
      idempotencyKey,
      amountCents,
      status: "reconciliation_required",
      attemptClaimedAt: null
    },
    {
      $set: {
        attemptClaimedAt: new Date()
      }
    },
    {
      returnDocument: "after"
    }
  )

  if (!record) {
    return Object.freeze({
      claimed: false,
      reason: "reservation_invalid_or_already_claimed",
      squareRequestAuthorized: false
    })
  }

  return Object.freeze({
    claimed: true,
    documentType,
    documentId: String(record.documentId),
    environment,
    amountCents: record.amountCents,
    idempotencyKey: record.idempotencyKey,
    claimedAt: record.attemptClaimedAt.toISOString(),
    squareRequestAuthorized: false,
    paymentCreated: false
  })
}
