import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js"

import {
  applyV3PreparedPayment,
  verifyV3AppliedPayment
} from "./smartShippingV3ApplyPayment.js"

import {
  verifyV3ProductionCheckoutBinding
} from "./verifyV3ProductionCheckoutBinding.js"

const blocked = reason => Object.freeze({
  prepared: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

/**
 * Atomically persist a verified production checkout order
 * and its pristine reservation and payment operation.
 *
 * This does NOT reconcile external payment history,
 * authorize Square creation, or permit payment retries.
 *
 * Do not expose this function directly as an HTTP route.
 */
export async function persistV3ProductionCheckoutAtomic({
  Order,
  Reservation,
  PaymentOperation,
  startSession,
  orderId,
  guestToken,
  signedQuote
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim()
  ) {
    return blocked("INVALID_CHECKOUT_INPUT")
  }

  if (
    typeof Order?.findById !== "function" ||
    typeof Reservation?.create !== "function" ||
    typeof Reservation?.findOne !== "function" ||
    typeof PaymentOperation?.create !== "function" ||
    typeof PaymentOperation?.findOne !== "function" ||
    typeof startSession !== "function"
  ) {
    return blocked("TRUSTED_REPOSITORIES_REQUIRED")
  }

  const purchaseKey =
    `signavi-v3-production-purchase-${id}`

  let session

  try {
    session = await startSession()

    if (
      typeof session?.withTransaction !== "function" ||
      typeof session?.endSession !== "function"
    ) {
      return blocked("TRANSACTION_SESSION_REQUIRED")
    }

    const result = await session.withTransaction(async () => {
      const order = await Order.findById(id).session(session)

      if (
        !order ||
        String(order._id).toLowerCase() !== id ||
        !["store", "cart_drawer"].includes(
          String(order.source || "").toLowerCase()
        ) ||
        order.status !== "payment_required" ||
        order.paymentStatus !== "unpaid" ||
        String(order.currency || "").toUpperCase() !== "USD" ||
        order.squareEnvironment != null ||
        order.squareExpectedAmountCents != null ||
        order.paymentUrl ||
        order.squarePaymentId ||
        order.squareOrderId ||
        order.squarePaymentLinkId
      ) {
        throw new Error("ORDER_NOT_ELIGIBLE")
      }

      // Validates the guest token and signed shipping
      // against the saved order inside this transaction.
      const prepared = prepareV3CheckoutPayment({
        order,
        guestToken,
        signedQuote
      })

      if (!prepared || prepared.orderId !== id) {
        throw new Error("SIGNED_CHECKOUT_NOT_VERIFIED")
      }

      const amountCents = prepared.totalCents

      applyV3PreparedPayment(order, prepared)

      order.squareEnvironment = "production"
      order.squareExpectedAmountCents = amountCents

      if (!verifyV3AppliedPayment(order, prepared)) {
        throw new Error("PREPARED_AMOUNT_MISMATCH")
      }

      await Reservation.create([{
        environment: "production",
        orderId: id,
        purchaseKey,
        idempotencyKey: purchaseKey,
        claimedByDocumentType: "order",
        claimedByDocumentId: id,
        status: "reserved",
        checkoutClaimOwner: null,
        checkoutClaimAmountCents: null,
        attemptClaimedAt: null
      }], { session })

      await PaymentOperation.create([{
        environment: "production",
        orderId: id,
        idempotencyKey: purchaseKey,
        amountCents,
        status: "pending",
        squareCreationAttemptClaimedAt: null,
        requestOwner: "",
        squareIdempotencyKey: null,
        squarePaymentLinkId: "",
        squareOrderId: "",
        paymentUrl: ""
      }], { session })

      await order.save({ session })

      // Verify all three persisted records in the
      // same MongoDB transaction.
      const storedOrder = await Order.findById(id)
        .session(session)

      const reservation = await Reservation.findOne({
        environment: "production",
        orderId: id
      }).session(session)

      const operation = await PaymentOperation.findOne({
        environment: "production",
        orderId: id
      }).session(session)

      const binding = verifyV3ProductionCheckoutBinding({
        order: storedOrder,
        prepared,
        reservation,
        operation
      })

      if (
        binding.verified !== true ||
        binding.orderId !== id ||
        binding.purchaseKey !== purchaseKey ||
        binding.amountCents !== amountCents
      ) {
        throw new Error("TRANSACTIONAL_BINDING_NOT_VERIFIED")
      }

      return {
        prepared: true,
        orderId: id,
        purchaseKey,
        amountCents,
        shippingAmountCents: prepared.shippingAmountCents,
        verifiedAmounts: { ...prepared },
        squareRequestAuthorized: false,
        retryAuthorized: false
      }
    })

    if (
      result?.prepared !== true ||
      result.orderId !== id ||
      result.purchaseKey !== purchaseKey
    ) {
      return blocked("TRANSACTION_RESULT_NOT_VERIFIED")
    }

    // Independent post-commit readback.
    // A successful transaction callback alone is not enough.
    const [storedOrder, reservation, operation] =
      await Promise.all([
        Order.findById(id).lean(),
        Reservation.findOne({
          environment: "production",
          orderId: id
        }).lean(),
        PaymentOperation.findOne({
          environment: "production",
          orderId: id
        }).lean()
      ])

    const binding = verifyV3ProductionCheckoutBinding({
      order: storedOrder,
      prepared: result.verifiedAmounts,
      reservation,
      operation
    })

    if (
      binding.verified !== true ||
      binding.orderId !== id ||
      binding.purchaseKey !== purchaseKey ||
      binding.amountCents !== result.amountCents
    ) {
      return blocked("POST_COMMIT_BINDING_NOT_VERIFIED")
    }

    return Object.freeze({
      prepared: true,
      orderId: id,
      purchaseKey,
      amountCents: result.amountCents,
      shippingAmountCents: result.shippingAmountCents,
      persistedAndVerified: true,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  } catch {
    // An uncertain commit must not automatically retry,
    // reset records, or create a Square payment link.
    return blocked("ATOMIC_PERSISTENCE_UNCERTAIN_OR_CONFLICTING")
  } finally {
    if (session) {
      await session.endSession()
    }
  }
}