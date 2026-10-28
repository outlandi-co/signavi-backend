import mongoose from "mongoose"
import {
  resolveV3ProductionPurchaseIdentity
} from "./resolveV3ProductionPurchaseIdentity.js"

/**
 * Test-only atomic claim.
 * No Square calls or payment-status updates.
 */
export async function claimV3ProductionPurchaseIsolated({
  documentType,
  documentId,
  orderId,
  loadOrder,
  loadAssociation,
  Reservation
}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  if (!Reservation ||
      typeof Reservation.findOneAndUpdate !== "function") {
    throw new Error("TRUSTED_REPOSITORY_REQUIRED")
  }

  const identity = await resolveV3ProductionPurchaseIdentity({
    documentType,
    documentId,
    orderId,
    loadOrder,
    loadAssociation
  })

  const reservation = await Reservation.findOneAndUpdate(
    {
      environment: "production",
      purchaseKey: identity.purchaseKey,
      orderId: new mongoose.Types.ObjectId(identity.orderId),
      claimedByDocumentType: identity.documentType,
      claimedByDocumentId:
        new mongoose.Types.ObjectId(identity.documentId),
      status: "reserved",
      attemptClaimedAt: null
    },
    {
      $set: {
        status: "claim_pending",
        attemptClaimedAt: new Date()
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )

  if (!reservation) {
    return Object.freeze({
      claimed: false,
      blocked: true,
      reason: "PURCHASE_NOT_CLAIMABLE",
      purchaseKey: identity.purchaseKey
    })
  }

  if (
    reservation.purchaseKey !== identity.purchaseKey ||
    reservation.status !== "claim_pending" ||
    !reservation.attemptClaimedAt
  ) {
    throw new Error("CLAIM_RESULT_MISMATCH")
  }

  return Object.freeze({
    claimed: true,
    blocked: false,
    purchaseKey: identity.purchaseKey
  })
}
