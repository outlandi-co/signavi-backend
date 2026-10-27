import mongoose from "mongoose"

import Order from "../models/Order.js"
import Invoice from "../models/Invoice.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import PaymentReservation from "../models/SharedSquarePaymentReservation.js"
import Ownership from "../models/SmartShippingV3PurchaseOwnership.js"
import Association from "../models/SmartShippingV3InvoiceOrderAssociation.js"

import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"

import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js"

import {
  validateInvoiceOrderCheckoutMatch
} from "./validateInvoiceOrderCheckoutMatch.js"

import {
  validateInvoiceOrderPaymentEvidence
} from "./validateInvoiceOrderPaymentEvidence.js"

// Internal durable invoice/order association preparation.
//
// NOT connected to an HTTP endpoint.
// NO Square authorization or external API calls.
//
// This transaction creates an association, NOT payment ownership.
// The durable checkout service must also reject existing
// associations before either service is connected to HTTP.
//
// The association is never a substitute for checking existing
// payment evidence or the checkout lock.
export const linkV3InvoiceOrderDurable = async ({
  lock,
  invoiceId,
  guestToken,
  signedQuote
} = {}) => {
  const enabled =
    ["development", "test"].includes(process.env.NODE_ENV) &&
    process.env.SQUARE_ENVIRONMENT === "sandbox" &&
    process.env.SMART_SHIPPING_V3_ENABLED === "true" &&
    process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED === "true" &&
    process.env.SMART_SHIPPING_V3_DURABLE_LINK_ENABLED === "true"

  if (!enabled) {
    throw new Error("Durable V3 invoice linking disabled.")
  }

  if (
    mongoose.connection.readyState !== 1 ||
    !lock ||
    !mongoose.isObjectIdOrHexString(lock.orderId) ||
    typeof lock.owner !== "string" ||
    !lock.owner.trim() ||
    !mongoose.isObjectIdOrHexString(invoiceId) ||
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim()
  ) {
    throw new Error("Invalid durable invoice linking inputs.")
  }

  const orderId = String(lock.orderId).toLowerCase()
  const orderObjectId = new mongoose.Types.ObjectId(orderId)
  const invoiceObjectId = new mongoose.Types.ObjectId(
    String(invoiceId)
  )

  const purchaseKey = `order:${orderId}`

  return runV3OwnedPaymentTransition({
    orderId,
    owner: lock.owner,

    transition: async session => {
      // All database operations within the transaction
      // run sequentially on the same session.
      const order = await Order.findById(orderObjectId)
        .session(session)

      const invoice = await Invoice.findById(invoiceObjectId)
        .session(session)

      if (!order || !invoice) {
        throw new Error("Durable invoice or order not found.")
      }

      // This helper independently verifies checkout credentials,
      // guest ownership, and the signed backend quote.
      const prepared = prepareV3CheckoutPayment({
        order,
        guestToken,
        signedQuote
      })

      if (!prepared) {
        throw new Error(
          "Durable invoice linking checkout verification failed."
        )
      }

      const match = validateInvoiceOrderCheckoutMatch({
        invoice,
        order,
        prepared
      })

      if (!match.eligible) {
        throw new Error(
          `Durable invoice/order match rejected: ${match.reason}`
        )
      }

      if (match.purchaseKey !== purchaseKey) {
        throw new Error("Durable purchase identity mismatch.")
      }

      // Existing associations, whether for this invoice
      // or for this order, must be reviewed rather than
      // silently overwritten or linked a second time.
      const existingAssociation = await Association.findOne({
        environment: "sandbox",
        $or: [
          { invoiceId: invoiceObjectId },
          { orderId: orderObjectId }
        ]
      }).session(session).lean()

      if (existingAssociation) {
        throw new Error(
          "Existing durable invoice/order association requires review."
        )
      }

      // A purchase already owned by checkout or invoice
      // cannot receive a new association.
      const existingOwnership = await Ownership.find({
        environment: "sandbox",
        purchaseKey
      }).session(session).lean()

      const paymentOperations = await PaymentOperation.find({
        orderId: orderObjectId
      }).session(session).lean()

      const orderReservations = await PaymentReservation.find({
        documentType: "order",
        documentId: orderObjectId,
        environment: "sandbox"
      }).session(session).lean()

      const invoiceReservations = await PaymentReservation.find({
        documentType: "invoice",
        documentId: invoiceObjectId,
        environment: "sandbox"
      }).session(session).lean()

      // The established validator accepts arrays of evidence.
      // Pass the durable canonical ownership records in place
      // of the isolated test-only purchase reservation collection.
      const evidence = validateInvoiceOrderPaymentEvidence({
        invoice,
        order,
        paymentOperations,
        orderReservations,
        invoiceReservations,
        purchaseReservations: existingOwnership
      })

      if (!evidence.eligible) {
        throw new Error(
          `Durable invoice payment evidence rejected: ${evidence.reason}`
        )
      }

      const records = await Association.create([{
        environment: "sandbox",
        invoiceId: invoiceObjectId,
        orderId: orderObjectId,
        purchaseKey,
        amountCents: match.amountCents
      }], { session })

      if (records.length !== 1) {
        throw new Error("Durable association creation failed.")
      }

      return Object.freeze({
        linked: true,
        associationId: String(records[0]._id),
        invoiceId: String(invoiceObjectId),
        orderId,
        purchaseKey,
        amountCents: match.amountCents,
        environment: "sandbox",
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }
  })
}