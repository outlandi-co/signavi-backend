import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import DocumentReservation from "../models/SharedSquarePaymentReservation.js"
import PurchaseReservation from "../models/SharedSquarePurchaseReservation.js"

// Isolated tests only. Read-only.
// This is not a transaction or payment authorization.
export const loadInvoiceOrderPaymentEvidence = async ({
  invoiceId,
  orderId,
  environment
} = {}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_reservation_isolated_test"
  ) {
    throw new Error("Payment evidence loader restricted to isolated tests.")
  }

  if (
    !mongoose.isObjectIdOrHexString(invoiceId) ||
    !mongoose.isObjectIdOrHexString(orderId) ||
    environment !== "sandbox"
  ) {
    throw new Error("Invalid payment evidence scope.")
  }

  const invoiceObjectId = new mongoose.Types.ObjectId(
    String(invoiceId)
  )

  const orderObjectId = new mongoose.Types.ObjectId(
    String(orderId)
  )

  const purchaseKey =
    `order:${String(orderObjectId).toLowerCase()}`

  const [
    paymentOperations,
    orderReservations,
    invoiceReservations,
    purchaseReservations
  ] = await Promise.all([
    PaymentOperation.find({
      orderId: orderObjectId
    }).lean(),

    DocumentReservation.find({
      documentType: "order",
      documentId: orderObjectId,
      environment
    }).lean(),

    DocumentReservation.find({
      documentType: "invoice",
      documentId: invoiceObjectId,
      environment
    }).lean(),

    PurchaseReservation.find({
      environment,
      purchaseKey
    }).lean()
  ])

  return Object.freeze({
    paymentOperations,
    orderReservations,
    invoiceReservations,
    purchaseReservations
  })
}