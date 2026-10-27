import mongoose from "mongoose"
import PurchaseReservation from "../models/SharedSquarePurchaseReservation.js"
import Association from "../models/InvoiceOrderAssociationV3.js"

// Test-only shared purchase claim.
// Does not authorize Square or invoke a payment route.
export const claimV3SharedPurchaseIsolated = async ({
  orderId,
  documentType,
  documentId
} = {}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_reservation_isolated_test"
  ) {
    throw new Error("V3 shared claim restricted to isolated tests.")
  }

  if (
    !mongoose.isObjectIdOrHexString(orderId) ||
    !mongoose.isObjectIdOrHexString(documentId) ||
    !["order", "invoice"].includes(documentType)
  ) {
    throw new Error("Invalid shared purchase claim.")
  }

  const orderKey = String(orderId).toLowerCase()
  const documentKey = String(documentId).toLowerCase()

  if (documentType === "order" && documentKey !== orderKey) {
    throw new Error("Order claim identity mismatch.")
  }

  if (documentType === "invoice") {
    const association = await Association.findOne({
      orderId: new mongoose.Types.ObjectId(orderKey),
      invoiceId: new mongoose.Types.ObjectId(documentKey),
      environment: "sandbox"
    }).lean()

    if (!association) {
      throw new Error("Invoice purchase association missing.")
    }
  }

  const purchaseKey = `order:${orderKey}`

  // The unique index, not an earlier read, determines
  // the winner of competing claims.
  try {
    const record = await PurchaseReservation.create({
      environment: "sandbox",
      purchaseKey,
      claimedByDocumentType: documentType,
      claimedByDocumentId:
        new mongoose.Types.ObjectId(documentKey),
      status: "reconciliation_required"
    })

    return Object.freeze({
      claimed: true,
      claimId: String(record._id),
      purchaseKey,
      documentType,
      documentId: documentKey,
      squareRequestAuthorized: false,
      paymentCreated: false
    })
  } catch (error) {
    if (error?.code === 11000) {
      return Object.freeze({
        claimed: false,
        reason: "purchase_already_claimed",
        purchaseKey,
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }

    throw error
  }
}