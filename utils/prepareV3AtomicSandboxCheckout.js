import crypto from "node:crypto"

import {
  runV3CrossDatabaseCheckoutTransition
} from "./runV3CrossDatabaseCheckoutTransition.js"
import mongoose from "mongoose"

import Order from "../models/Order.js"
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
  createV3SquareSafeCheckoutReference
} from "./smartShippingV3CheckoutReference.js"

import {
  verifyV3OrderPaymentBinding
} from "./smartShippingV3OrderPaymentBinding.js"

import {
  applyV3PreparedPayment,
  verifyV3AppliedPayment
} from "./smartShippingV3ApplyPayment.js"

// Internal sandbox-only atomic preparation.
//
// This service is intentionally NOT connected to the HTTP route.
// It does not authorize or execute a Square request.
//
// Invoice/order association enforcement must be completed
// before connecting this service to normal checkout.
export const prepareV3AtomicSandboxCheckout = async ({
  lock,
  guestToken,
  signedQuote,
  simulateFailureAfterOrderSave = false,
  storefrontConnection,
  sandboxConnection
} = {}) => {
  const enabled =
    ["development", "test"].includes(process.env.NODE_ENV) &&
    process.env.SQUARE_ENVIRONMENT === "sandbox" &&
    process.env.SMART_SHIPPING_V3_ENABLED === "true" &&
    process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED === "true" &&
    process.env.SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED === "true"

  if (!enabled) {
    throw new Error("Durable V3 sandbox preparation disabled.")
  }

  if (
    !lock ||
    !mongoose.isObjectIdOrHexString(lock.orderId) ||
    typeof lock.owner !== "string" ||
    !lock.owner.trim() ||
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim() ||
    mongoose.connection.readyState !== 1
  ) {
    throw new Error("Invalid durable V3 checkout inputs.")
  }

  const crossMode =
    storefrontConnection != null ||
    sandboxConnection != null

  if (crossMode && (
    process.env.NODE_ENV !== "test" ||
    process.env.SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED !== "true" ||
    !storefrontConnection ||
    !sandboxConnection
  )) {
    throw new Error("V3_CROSS_DATABASE_TEST_NOT_AUTHORIZED")
  }

  const orderId = String(lock.orderId).toLowerCase()
  const orderObjectId = new mongoose.Types.ObjectId(orderId)
  const purchaseKey = `order:${orderId}`

  const execute = async (session, models) => {
    const {
      StoreOrder,
      StoreSharedReservation,
      SandboxPaymentOperation,
      SandboxOwnership,
      SandboxAssociation,
      SandboxSharedReservation
    } = models

    if (crossMode) {
      const heldLock = await sandboxConnection
        .collection("smart_shipping_v3_checkout_locks")
        .findOne({
          _id: orderObjectId,
          owner: lock.owner,
          expiresAt: { $gt: new Date() }
        }, { session })

      if (!heldLock) {
        throw new Error("V3_SANDBOX_CHECKOUT_LOCK_NOT_VERIFIED")
      }

      const storeOperation = await storefrontConnection
        .collection(PaymentOperation.collection.name)
        .findOne({ orderId: orderObjectId }, { session })

      if (storeOperation) {
        throw new Error("Existing Store payment operation requires review.")
      }

      const storeAssociation = await storefrontConnection
        .collection(Association.collection.name)
        .findOne({ orderId: orderObjectId }, { session })

      if (storeAssociation) {
        throw new Error("Existing Store invoice association requires review.")
      }
    }
      const order = await StoreOrder.findById(orderObjectId)
        .session(session)

      const prepared = prepareV3CheckoutPayment({
        order,
        guestToken,
        signedQuote
      })

      if (!prepared || prepared.orderId !== orderId) {
        throw new Error("Durable V3 checkout validation failed.")
      }

      if (
        order.squareEnvironment &&
        order.squareEnvironment !== "sandbox"
      ) {
        throw new Error("Existing Square environment conflict.")
      }

      if (
        order.squareExpectedAmountCents != null &&
        order.squareExpectedAmountCents !== prepared.totalCents
      ) {
        throw new Error("Existing Square payment amount conflict.")
      }

      // Existing payment evidence always blocks new ownership.
      const existingOperation = await SandboxPaymentOperation.findOne({
        orderId: orderObjectId
      }).session(session).lean()

      if (existingOperation) {
        throw new Error("Existing payment operation requires review.")
      }

      const reservationFilter = {
        documentType: "order",
        documentId: orderObjectId,
        ...(crossMode ? {} : { environment: "sandbox" })
      }

      const existingStoreReservation =
        await StoreSharedReservation.findOne(reservationFilter)
          .session(session).lean()

      if (existingStoreReservation) {
        throw new Error("Existing payment reservation requires review.")
      }

      if (crossMode) {
        const existingSandboxReservation =
          await SandboxSharedReservation.findOne(reservationFilter)
            .session(session).lean()

        if (existingSandboxReservation) {
          throw new Error(
            "Existing Sandbox payment reservation requires review."
          )
        }
      }

      const existingAssociation = await SandboxAssociation.findOne({
        environment: "sandbox",
        orderId: orderObjectId
      }).session(session).lean()

      if (existingAssociation) {
        throw new Error(
          "Existing durable invoice/order association requires review."
        )
      }
      const existingOwnership = await SandboxOwnership.findOne({
        environment: "sandbox",
        purchaseKey
      }).session(session).lean()

      if (existingOwnership) {
        throw new Error("Existing purchase ownership requires review.")
      }

      // The unique purchase key provides durable ownership.
      // All subsequent writes use this same transaction session.
      const ownership = await SandboxOwnership.create([{
        environment: "sandbox",
        purchaseKey,
        claimedByDocumentType: "order",
        claimedByDocumentId: orderObjectId,
        status: "reconciliation_required"
      }], { session })

      const operations = await SandboxPaymentOperation.create([{
        orderId: orderObjectId,
        checkoutReferenceId:
          createV3SquareSafeCheckoutReference({ orderId }),
        idempotencyKey:
          `signavi-v3-sandbox-${crypto.randomUUID()}`,
        amountCents: prepared.totalCents,
        environment: "sandbox",
        status: "pending"
      }], { session })

      const operation = operations[0]

      const binding = verifyV3OrderPaymentBinding({
        order,
        prepared,
        operation
      })

      applyV3PreparedPayment(order, prepared)

      order.squareEnvironment = "sandbox"
      order.squareExpectedAmountCents = prepared.totalCents

      if (!verifyV3AppliedPayment(order, prepared)) {
        throw new Error("V3 order payment binding failed.")
      }

      await order.save({ session })

      if (simulateFailureAfterOrderSave === true) {
        if (
          process.env.NODE_ENV !== "test" ||
          (
            !crossMode &&
            mongoose.connection.db?.databaseName !==
              "signavi_reservation_isolated_test"
          )
        ) {
          throw new Error("Failure injection unavailable.")
        }

        throw new Error("SIMULATED_DURABLE_ORDER_SAVE_FAILURE")
      }

      const storedOrder = await StoreOrder.findById(orderObjectId)
        .session(session)

      if (
        !storedOrder ||
        !verifyV3AppliedPayment(storedOrder, prepared) ||
        storedOrder.squareEnvironment !== "sandbox" ||
        storedOrder.squareExpectedAmountCents !== prepared.totalCents
      ) {
        throw new Error("V3 stored order verification failed.")
      }

      const operationCheck = await SandboxPaymentOperation.updateOne(
        {
          _id: operation._id,
          orderId: orderObjectId,
          checkoutReferenceId: binding.checkoutReferenceId,
          amountCents: prepared.totalCents,
          environment: "sandbox",
          status: "pending",
          requestOwner: "",
          squarePaymentLinkId: "",
          squareOrderId: "",
          paymentUrl: ""
        },
        { $currentDate: { updatedAt: true } },
        { session }
      )

      if (operationCheck.matchedCount !== 1) {
        throw new Error("V3 payment operation changed.")
      }

      return Object.freeze({
        success: true,
        orderId,
        purchaseKey,
        ownershipId: String(ownership[0]._id),
        paymentOperationId: String(operation._id),
        checkoutReferenceId: binding.checkoutReferenceId,
        amountCents: prepared.totalCents,
        shippingAmountCents: prepared.shippingAmountCents,
        orderPaymentBound: true,
        environment: "sandbox",
        squareRequestAuthorized: false,
        paymentCreated: false
      })
  }

  if (crossMode) {
    return runV3CrossDatabaseCheckoutTransition({
      storefrontConnection,
      sandboxConnection,
      transition: ({ session, models }) => execute(session, models)
    })
  }

  return runV3OwnedPaymentTransition({
    orderId,
    owner: lock.owner,
    transition: session => execute(session, {
      StoreOrder: Order,
      StoreSharedReservation: PaymentReservation,
      SandboxPaymentOperation: PaymentOperation,
      SandboxOwnership: Ownership,
      SandboxAssociation: Association,
      SandboxSharedReservation: PaymentReservation
    })
  })
}