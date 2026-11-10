import mongoose from "mongoose"

import {
  runV3CrossDatabaseCheckoutTransition
} from "./runV3CrossDatabaseCheckoutTransition.js"

import {
  inspectV3PendingSquareBinding
} from "./smartShippingV3PendingSquareBinding.js"

// TEST ONLY: State reservation, not Square execution.
// Never connect directly to a public checkout route.
export async function reserveV3CrossDatabaseSandboxRequest({
  orderId,
  owner,
  storefrontConnection,
  sandboxConnection
} = {}) {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED !== "true"
  ) {
    throw new Error("V3_CROSS_DATABASE_RESERVATION_TEST_ONLY")
  }

  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim()
  ) {
    throw new Error("V3_RESERVATION_IDENTITY_REJECTED")
  }

  const id = String(orderId).toLowerCase()
  const objectId = new mongoose.Types.ObjectId(id)
  const purchaseKey = `order:${id}`

  return runV3CrossDatabaseCheckoutTransition({
    storefrontConnection,
    sandboxConnection,

    transition: async ({ session, models }) => {
      const {
        StoreOrder,
        StoreSharedReservation,
        SandboxPaymentOperation,
        SandboxOwnership,
        SandboxAssociation,
        SandboxSharedReservation
      } = models

      const lock = await sandboxConnection
        .collection("smart_shipping_v3_checkout_locks")
        .findOne({
          _id: objectId,
          owner,
          expiresAt: { $gt: new Date() }
        }, { session })

      if (!lock) {
        throw new Error("V3_RESERVATION_LOCK_REJECTED")
      }

      const order = await StoreOrder.findById(objectId)
        .session(session)

      if (
        !order ||
        String(order.source || "").toLowerCase() !== "store"
      ) {
        throw new Error("V3_STOREFRONT_ORDER_REJECTED")
      }

      const operation = await SandboxPaymentOperation
        .findOne({ orderId: objectId })
        .session(session)

      const assessment = inspectV3PendingSquareBinding({
        order,
        operation
      })

      if (!assessment.consistent) {
        throw new Error(
          `V3_RESERVATION_BINDING_REJECTED:${assessment.reason}`
        )
      }

      // A prior Store-side payment operation blocks a new
      // Sandbox reservation. Do not ignore legacy evidence.
      const legacyOperation = await storefrontConnection
        .collection(SandboxPaymentOperation.collection.name)
        .findOne(
          { orderId: objectId },
          { session, projection: { _id: 1 } }
        )

      if (legacyOperation) {
        throw new Error("V3_LEGACY_OPERATION_REQUIRES_REVIEW")
      }

      const reservationQuery = {
        documentType: "order",
        documentId: objectId
      }

      const [
        storeReservation,
        sandboxReservation,
        sandboxAssociation,
        storeAssociation,
        ownership
      ] = await Promise.all([
        StoreSharedReservation
          .findOne(reservationQuery).session(session).lean(),

        SandboxSharedReservation
          .findOne(reservationQuery).session(session).lean(),

        SandboxAssociation
          .findOne({ orderId: objectId })
          .session(session).lean(),

        storefrontConnection
          .collection(SandboxAssociation.collection.name)
          .findOne(
            { orderId: objectId },
            { session, projection: { _id: 1 } }
          ),

        SandboxOwnership
          .findOne({ environment: "sandbox", purchaseKey })
          .session(session).lean()
      ])

      if (storeReservation || sandboxReservation) {
        throw new Error("V3_PAYMENT_HISTORY_REQUIRES_REVIEW")
      }

      if (sandboxAssociation || storeAssociation) {
        throw new Error("V3_INVOICE_ASSOCIATION_REQUIRES_REVIEW")
      }

      if (
        !ownership ||
        ownership.claimedByDocumentType !== "order" ||
        String(ownership.claimedByDocumentId) !== id ||
        ownership.status !== "reconciliation_required"
      ) {
        throw new Error("V3_PURCHASE_OWNERSHIP_REJECTED")
      }

      // Atomic compare-and-set. Never create another operation,
      // regenerate an idempotency key, or retry Square.
      const updated = await SandboxPaymentOperation.findOneAndUpdate(
        {
          _id: operation._id,
          orderId: objectId,
          environment: "sandbox",
          status: "pending",
          requestOwner: "",
          amountCents: assessment.amountCents,
          checkoutReferenceId: assessment.checkoutReferenceId,
          idempotencyKey: operation.idempotencyKey,
          squareCreationAttemptClaimedAt: null,
          squarePaymentLinkId: "",
          squareOrderId: "",
          paymentUrl: ""
        },
        {
          $set: {
            status: "reconciliation_required",
            requestOwner: owner
          }
        },
        {
          session,
          returnDocument: "after"
        }
      )

      if (!updated) {
        throw new Error("V3_RESERVATION_CONCURRENCY_REJECTED")
      }

      return Object.freeze({
        orderId: id,
        owner,
        environment: "sandbox",
        status: "reconciliation_required",
        requestReserved: true,
        amountCents: assessment.amountCents,
        checkoutReferenceId: assessment.checkoutReferenceId,
        paymentOperationId: String(updated._id),
        idempotencyKey: updated.idempotencyKey,
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }
  })
}