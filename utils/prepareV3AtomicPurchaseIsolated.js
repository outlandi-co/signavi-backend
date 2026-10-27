import crypto from "node:crypto"
import {
  applyV3PreparedPayment,
  verifyV3AppliedPayment
} from "./smartShippingV3ApplyPayment.js"
import {
  verifyV3OrderPaymentBinding
} from "./smartShippingV3OrderPaymentBinding.js"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import Invoice from "../models/Invoice.js"
import Association from "../models/InvoiceOrderAssociationV3.js"
import Purchase from "../models/SharedSquarePurchaseReservation.js"
import Operation from "../models/SmartShippingV3PaymentOperation.js"
import Reservation from "../models/SharedSquarePaymentReservation.js"
import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"
import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js"
import {
  createV3SquareSafeCheckoutReference
} from "./smartShippingV3CheckoutReference.js"
import {
  validateInvoiceOrderCheckoutMatch
} from "./validateInvoiceOrderCheckoutMatch.js"

// Strictly test-only. Never calls Square or authorizes execution.
export const prepareV3AtomicPurchaseIsolated = async ({
  lock,
  documentType,
  documentId,
  guestToken,
  signedQuote,
  simulateFailureAfterClaim = false,
  simulateFailureAfterBinding = false
} = {}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_reservation_isolated_test"
  ) {
    throw new Error("Atomic purchase restricted to isolated tests.")
  }

  if (
    !lock ||
    !mongoose.isObjectIdOrHexString(lock.orderId) ||
    typeof lock.owner !== "string" ||
    !lock.owner.trim() ||
    !["order", "invoice"].includes(documentType) ||
    !mongoose.isObjectIdOrHexString(documentId) ||
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim()
  ) {
    throw new Error("Invalid atomic purchase inputs.")
  }

  const orderId = String(lock.orderId).toLowerCase()
  const documentKey = String(documentId).toLowerCase()
  const orderObjectId = new mongoose.Types.ObjectId(orderId)
  const purchaseKey = `order:${orderId}`

  if (documentType === "order" && documentKey !== orderId) {
    throw new Error("Order identity mismatch.")
  }

  return runV3OwnedPaymentTransition({
    orderId,
    owner: lock.owner,
    transition: async session => {
      const order = await Order.findById(orderObjectId)
        .session(session)

      const prepared = prepareV3CheckoutPayment({
        order,
        guestToken,
        signedQuote
      })

      if (!prepared) {
        throw new Error("Checkout authorization or quote invalid.")
      }

      const association = await Association.findOne({
        orderId: orderObjectId,
        environment: "sandbox"
      }).session(session).lean()

      if (documentType === "order" && association) {
        throw new Error("Invoice association owns purchase path.")
      }

      if (documentType === "invoice") {
        if (
          !association ||
          String(association.invoiceId).toLowerCase() !== documentKey
        ) {
          throw new Error("Invoice association missing.")
        }

        const invoice = await Invoice.findById(
          new mongoose.Types.ObjectId(documentKey)
        ).session(session)

        const match = validateInvoiceOrderCheckoutMatch({
          invoice,
          order,
          prepared
        })

        if (!match.eligible) {
          throw new Error(
            `Invoice checkout mismatch: ${match.reason}`
          )
        }
      }

      const existingOperation = await Operation.findOne({
        orderId: orderObjectId
      }).session(session).lean()

      if (existingOperation) {
        throw new Error("Payment operation already exists.")
      }

      const evidence = [{
        documentType: "order",
        documentId: orderObjectId,
        environment: "sandbox"
      }]

      if (association?.invoiceId) {
        evidence.push({
          documentType: "invoice",
          documentId: association.invoiceId,
          environment: "sandbox"
        })
      }

      const reservation = await Reservation.findOne({
        $or: evidence
      }).session(session).lean()

      if (reservation) {
        throw new Error("Payment reservation already exists.")
      }

      const claimed = await Purchase.create([{
        environment: "sandbox",
        purchaseKey,
        claimedByDocumentType: documentType,
        claimedByDocumentId:
          new mongoose.Types.ObjectId(documentKey),
        status: "reconciliation_required"
      }], { session })

      // Deliberate failure injection, available only in this
      // isolated test service. Confirms transaction rollback.
      if (simulateFailureAfterClaim === true) {
        throw new Error("SIMULATED_OPERATION_FAILURE")
      }

      const operation = await Operation.create([{
        orderId: orderObjectId,
        idempotencyKey:
          `signavi-v3-sandbox-${crypto.randomUUID()}`,
        amountCents: prepared.totalCents,
        environment: "sandbox",
        status: "pending",
        checkoutReferenceId:
          createV3SquareSafeCheckoutReference({ orderId })
      }], { session })

      // Reject conflicting existing payment ownership.
      if (
        order.squareEnvironment &&
        order.squareEnvironment !== "sandbox"
      ) {
        throw new Error("V3 order Square environment mismatch.")
      }

      if (
        order.squareExpectedAmountCents != null &&
        order.squareExpectedAmountCents !== prepared.totalCents
      ) {
        throw new Error("V3 saved payment amount mismatch.")
      }

      const binding = verifyV3OrderPaymentBinding({
        order,
        prepared,
        operation: operation[0]
      })

      applyV3PreparedPayment(order, prepared)

      order.squareEnvironment = "sandbox"
      order.squareExpectedAmountCents = prepared.totalCents

      if (!verifyV3AppliedPayment(order, prepared)) {
        throw new Error("V3 prepared order verification failed.")
      }

      await order.save({ session })

      // Failure injection proves that even a saved order
      // is rolled back along with claim and operation.
      if (simulateFailureAfterBinding === true) {
        throw new Error("SIMULATED_BINDING_FAILURE")
      }

      const storedOrder = await Order.findById(orderObjectId)
        .session(session)

      if (
        !storedOrder ||
        !verifyV3AppliedPayment(storedOrder, prepared) ||
        storedOrder.squareEnvironment !== "sandbox" ||
        storedOrder.squareExpectedAmountCents !== prepared.totalCents
      ) {
        throw new Error("V3 transactional order binding mismatch.")
      }

      // Confirm the operation remained in its pristine
      // pre-execution state.
      const operationUpdate = await Operation.updateOne(
        {
          _id: operation[0]._id,
          orderId: orderObjectId,
          environment: "sandbox",
          amountCents: prepared.totalCents,
          checkoutReferenceId: binding.checkoutReferenceId,
          status: "pending",
          requestOwner: "",
          squarePaymentLinkId: "",
          squareOrderId: "",
          paymentUrl: ""
        },
        { $currentDate: { updatedAt: true } },
        { session }
      )

      if (operationUpdate.matchedCount !== 1) {
        throw new Error("V3 operation binding changed.")
      }
      return Object.freeze({
        prepared: true,
        orderId,
        documentType,
        purchaseKey,
        claimId: String(claimed[0]._id),
        paymentOperationId: String(operation[0]._id),
        amountCents: prepared.totalCents,
        squareRequestAuthorized: false,
        paymentCreated: false,
        orderPaymentBound: true,
        checkoutReferenceId: binding.checkoutReferenceId,
        shippingAmountCents: prepared.shippingAmountCents
      })
    }
  })
}