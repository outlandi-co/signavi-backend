import crypto from "node:crypto"
import mongoose from "mongoose"
import Reservation from "../models/SharedSquarePaymentReservation.js"

// Isolated-test-only identity reservation.
// Does not authorize payment creation or release prior claims.
export const reserveSharedSquarePaymentIdentity = async ({
  documentType,
  documentId,
  environment,
  amountCents
}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_reservation_isolated_test"
  ) {
    throw new Error("Shared payment reservation restricted to isolated tests.")
  }

  if (
    !["order", "invoice"].includes(documentType) ||
    !mongoose.isValidObjectId(documentId) ||
    !["sandbox", "production"].includes(environment) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    throw new Error("Invalid shared payment identity.")
  }

  const id = String(documentId).toLowerCase()
  const idempotencyKey =
    `signavi-v3-${environment}-${documentType}-${id}`

  try {
    const record = await Reservation.create({
      documentType,
      documentId: new mongoose.Types.ObjectId(id),
      environment,
      amountCents,
      owner: crypto.randomUUID(),
      idempotencyKey,
      status: "reconciliation_required"
    })

    return Object.freeze({
      reserved: true,
      documentType,
      documentId: id,
      environment,
      amountCents: record.amountCents,
      idempotencyKey: record.idempotencyKey,
      squareRequestAuthorized: false
    })
  } catch (error) {
    if (error?.code === 11000) {
      return Object.freeze({
        reserved: false,
        reason: "payment_identity_already_reserved",
        squareRequestAuthorized: false
      })
    }

    throw error
  }
}