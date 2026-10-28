import mongoose from "mongoose"

/**
 * TEST-ONLY prototype.
 *
 * verifyBinding is injected solely to exercise the database
 * boundary. Production must use the real trusted Square
 * payment-binding verifier before integrating this logic.
 *
 * Never contacts Square.
 * Never enables payment creation.
 * Never changes the reservation claim automatically.
 */
export async function recordV3ProductionPaymentIsolated({
  orderId,
  Order,
  Reservation,
  PaymentOperation,
  verifyBinding,
  payment,
  squareOrder,
  expectedLocationId,
  afterOrderWrite
}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  if (
    typeof Order?.findOne !== "function" ||
    typeof Order?.findOneAndUpdate !== "function" ||
    typeof Reservation?.findOne !== "function" ||
    typeof PaymentOperation?.findOne !== "function" ||
    typeof verifyBinding !== "function"
  ) {
    throw new Error("TRUSTED_DEPENDENCIES_REQUIRED")
  }

  const id = String(orderId ?? "").toLowerCase()

  if (!/^[0-9a-f]{24}$/.test(id)) {
    throw new Error("INVALID_ORDER_ID")
  }

  const purchaseKey = `signavi-v3-production-purchase-${id}`

  const [order, reservation, operation] = await Promise.all([
    Order.findOne({ _id: id }),
    Reservation.findOne({
      orderId: id,
      environment: "production",
      purchaseKey
    }),
    PaymentOperation.findOne({
      orderId: id,
      environment: "production"
    })
  ])

  const hold = reason => Object.freeze({
    recorded: false,
    replay: false,
    reason,
    purchaseKey,
    squareCreationAuthorized: false,
    retryAuthorized: false
  })

  if (!order || !reservation || !operation) {
    return hold("REQUIRED_RECORD_MISSING")
  }

  if (
    order.squareEnvironment !== "production" ||
    reservation.environment !== "production" ||
    operation.environment !== "production" ||
    String(reservation.orderId) !== id ||
    String(operation.orderId) !== id ||
    reservation.purchaseKey !== purchaseKey ||
    reservation.idempotencyKey !== purchaseKey ||
    operation.idempotencyKey !== purchaseKey
  ) {
    return hold("CANONICAL_IDENTITY_MISMATCH")
  }

  if (
    reservation.status !== "claim_pending" ||
    !reservation.attemptClaimedAt ||
    operation.status !== "completed" ||
    !operation.squareCreationAttemptClaimedAt
  ) {
    return hold("DURABLE_PAYMENT_STATE_NOT_VERIFIED")
  }

  // The verifier must validate trusted Square lookup data.
  // An arbitrary incoming webhook payload is insufficient.
  const binding = verifyBinding({
    order,
    operation,
    payment,
    squareOrder,
    expectedLocationId
  })

  if (
    binding?.bindingVerified !== true ||
    binding.environment !== "production" ||
    binding.orderId !== id ||
    binding.squarePaymentId !== payment?.id ||
    binding.squareOrderId !== squareOrder?.id ||
    !Number.isSafeInteger(binding.amountCents) ||
    binding.amountCents < 1 ||
    binding.databaseWriteAuthorized !== false ||
    binding.paymentCreationAuthorized !== false
  ) {
    return hold("VERIFIED_BINDING_REQUIRED")
  }

  if (binding.exactPaidReplay === true) {
    return Object.freeze({
      recorded: false,
      replay: true,
      reason: "EXACT_PAID_REPLAY",
      purchaseKey,
      squareCreationAuthorized: false,
      retryAuthorized: false
    })
  }

  if (
    order.status !== "payment_required" ||
    order.paymentStatus !== "unpaid"
  ) {
    return hold("ORDER_NOT_PAYABLE")
  }

  const now = new Date()

  const updated = await Order.findOneAndUpdate(
    {
      _id: new mongoose.Types.ObjectId(id),
      squareEnvironment: "production",
      status: "payment_required",
      paymentStatus: "unpaid",
      squareExpectedAmountCents: binding.amountCents,
      squarePaymentId: { $in: [null, ""] },
      squareOrderId: {
        $in: [null, "", binding.squareOrderId]
      }
    },
    {
      $set: {
        status: "paid",
        paymentStatus: "paid",
        paymentMethod: "Square",
        squarePaymentId: binding.squarePaymentId,
        squareOrderId: binding.squareOrderId,
        paidAt: now
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )

  if (!updated) {
    return hold("ATOMIC_PAYMENT_UPDATE_BLOCKED")
  }

  // Injected crash simulation, never used by an active route.
  if (typeof afterOrderWrite === "function") {
    await afterOrderWrite()
  }

  return Object.freeze({
    recorded: true,
    replay: false,
    purchaseKey,
    squarePaymentId: binding.squarePaymentId,
    squareCreationAuthorized: false,
    retryAuthorized: false
  })
}
