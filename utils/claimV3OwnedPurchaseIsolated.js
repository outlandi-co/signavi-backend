import mongoose from "mongoose"
import Association from "../models/InvoiceOrderAssociationV3.js"
import Operation from "../models/SmartShippingV3PaymentOperation.js"
import DocumentReservation from "../models/SharedSquarePaymentReservation.js"
import Purchase from "../models/SharedSquarePurchaseReservation.js"
import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"

// Isolated test-only owned purchase claim.
// All evidence checks and the claim write share one transaction.
// This is not authorization for Square execution.
export const claimV3OwnedPurchaseIsolated = async ({
  lock,
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
    throw new Error("V3 owned claim restricted to isolated tests.")
  }

  if (
    !lock ||
    !mongoose.isObjectIdOrHexString(lock.orderId) ||
    typeof lock.owner !== "string" ||
    !lock.owner.trim() ||
    !mongoose.isObjectIdOrHexString(documentId) ||
    !["order", "invoice"].includes(documentType)
  ) {
    throw new Error("Invalid owned purchase claim.")
  }

  const orderId = String(lock.orderId).toLowerCase()
  const documentKey = String(documentId).toLowerCase()

  if (documentType === "order" && documentKey !== orderId) {
    throw new Error("Order claim identity mismatch.")
  }

  const orderObjectId = new mongoose.Types.ObjectId(orderId)
  const purchaseKey = `order:${orderId}`

  return runV3OwnedPaymentTransition({
    orderId,
    owner: lock.owner,
    transition: async session => {
      const association = await Association.findOne({
        orderId: orderObjectId,
        environment: "sandbox"
      }).session(session).lean()

      if (documentType === "invoice") {
        if (
          !association ||
          String(association.invoiceId).toLowerCase() !== documentKey
        ) {
          throw new Error("Invoice purchase association missing.")
        }
      }

      const operation = await Operation.findOne({
        orderId: orderObjectId
      }).session(session).lean()

      if (operation) {
        throw new Error("Order payment operation exists.")
      }

      const evidenceQueries = [{
        documentType: "order",
        documentId: orderObjectId,
        environment: "sandbox"
      }]

      if (association?.invoiceId) {
        evidenceQueries.push({
          documentType: "invoice",
          documentId: association.invoiceId,
          environment: "sandbox"
        })
      }

      const reservation = await DocumentReservation.findOne({
        $or: evidenceQueries
      }).session(session).lean()

      if (reservation) {
        throw new Error("Document payment reservation exists.")
      }

      // An indexed insert determines the winner.
      // Keep the unique index initialized before testing.
      const created = await Purchase.create([{
        environment: "sandbox",
        purchaseKey,
        claimedByDocumentType: documentType,
        claimedByDocumentId:
          new mongoose.Types.ObjectId(documentKey),
        status: "reconciliation_required"
      }], { session })

      return Object.freeze({
        claimed: true,
        claimId: String(created[0]._id),
        purchaseKey,
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }
  })
}