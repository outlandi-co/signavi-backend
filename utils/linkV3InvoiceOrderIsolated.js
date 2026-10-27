import mongoose from "mongoose"
import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js"
import Order from "../models/Order.js"
import Invoice from "../models/Invoice.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import DocumentReservation from "../models/SharedSquarePaymentReservation.js"
import PurchaseReservation from "../models/SharedSquarePurchaseReservation.js"
import Association from "../models/InvoiceOrderAssociationV3.js"

import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"

import {
  validateInvoiceOrderCheckoutMatch
} from "./validateInvoiceOrderCheckoutMatch.js"

import {
  validateInvoiceOrderPaymentEvidence
} from "./validateInvoiceOrderPaymentEvidence.js"

// Isolated test-only integration service.
// No API route, no Square authorization, no external calls.
// "prepared" is test fixture input, NOT independently authenticated.
export const linkV3InvoiceOrderIsolated = async ({
  lock,
  invoiceId,
  guestToken,
  signedQuote
} = {}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_reservation_isolated_test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    throw new Error("V3 linking restricted to isolated tests.")
  }

  if (
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
    throw new Error("Invalid V3 linking inputs.")
  }

  const orderId = new mongoose.Types.ObjectId(
    String(lock.orderId)
  )

  const invoiceObjectId = new mongoose.Types.ObjectId(
    String(invoiceId)
  )

  const purchaseKey =
    `order:${String(orderId).toLowerCase()}`

  return runV3OwnedPaymentTransition({
    orderId: String(orderId),
    owner: lock.owner,

    transition: async session => {
      const order = await Order.findById(orderId)
        .session(session)

      const invoice = await Invoice.findById(invoiceObjectId)
        .session(session)

      // Derive the amount from the freshly loaded order
      // and cryptographically verified checkout credentials.
      const prepared = prepareV3CheckoutPayment({
        order,
        guestToken,
        signedQuote
      })

      if (!prepared) {
        throw new Error(
          "V3 linking rejected: checkout authorization or quote invalid."
        )
      }

      const match = validateInvoiceOrderCheckoutMatch({
        invoice,
        order,
        prepared
      })

      if (!match.eligible) {
        throw new Error(
          `V3 invoice/order match rejected: ${match.reason}`
        )
      }

      // MongoDB operations within one transaction session must
      // execute sequentially.
      const paymentOperations = await PaymentOperation.find({
        orderId
      }).session(session).lean()

      const orderReservations = await DocumentReservation.find({
        documentType: "order",
        documentId: orderId,
        environment: "sandbox"
      }).session(session).lean()

      const invoiceReservations = await DocumentReservation.find({
        documentType: "invoice",
        documentId: invoiceObjectId,
        environment: "sandbox"
      }).session(session).lean()

      const purchaseReservations = await PurchaseReservation.find({
        environment: "sandbox",
        purchaseKey
      }).session(session).lean()

      const evidence = validateInvoiceOrderPaymentEvidence({
        invoice,
        order,
        paymentOperations,
        orderReservations,
        invoiceReservations,
        purchaseReservations
      })

      if (!evidence.eligible) {
        throw new Error(
          `V3 payment evidence rejected: ${evidence.reason}`
        )
      }

      const records = await Association.create([{
        invoiceId: invoiceObjectId,
        orderId,
        environment: "sandbox",
        purchaseKey,
        amountCents: match.amountCents
      }], { session })

      return Object.freeze({
        linked: true,
        associationId: String(records[0]._id),
        invoiceId: String(invoiceObjectId),
        orderId: String(orderId),
        purchaseKey,
        amountCents: match.amountCents,
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }
  })
}