import mongoose from "mongoose"

export async function recordV3ProductionPaymentTransactionalIsolated({
  orderId,
  connection,
  Order,
  Reservation,
  PaymentOperation,
  verifiedBinding,
  afterReads
}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  if (
    typeof connection?.startSession !== "function" ||
    typeof Order?.findOne !== "function" ||
    typeof Reservation?.findOne !== "function" ||
    typeof PaymentOperation?.findOne !== "function"
  ) {
    throw new Error("TRUSTED_DEPENDENCIES_REQUIRED")
  }

  const id = String(orderId ?? "").toLowerCase()
  if (!/^[0-9a-f]{24}$/.test(id)) {
    throw new Error("INVALID_ORDER_ID")
  }

  const purchaseKey = `signavi-v3-production-purchase-${id}`

  // This is a test-only assertion boundary.
  // Production integration must obtain verifiedBinding from the
  // actual verifier using authenticated Square lookup results.
  if (
    verifiedBinding?.bindingVerified !== true ||
    verifiedBinding?.environment !== "production" ||
    verifiedBinding?.orderId !== id ||
    verifiedBinding?.databaseWriteAuthorized !== false ||
    verifiedBinding?.paymentCreationAuthorized !== false ||
    !verifiedBinding?.squarePaymentId ||
    !verifiedBinding?.squareOrderId ||
    !Number.isSafeInteger(verifiedBinding?.amountCents) ||
    verifiedBinding.amountCents < 1
  ) {
    throw new Error("VERIFIED_PAYMENT_BINDING_REQUIRED")
  }

  const session = await connection.startSession()
  let recorded = false

  try {
    await session.withTransaction(async () => {
      recorded = false

      const order = await Order.findOne({
        _id: id,
        squareEnvironment: "production"
      }).session(session)

      const reservation = await Reservation.findOne({
        environment: "production",
        orderId: id,
        purchaseKey
      }).session(session)

      const operation = await PaymentOperation.findOne({
        environment: "production",
        orderId: id,
        idempotencyKey: purchaseKey
      }).session(session)

      if (!order || !reservation || !operation) {
        throw new Error("REQUIRED_PURCHASE_RECORD_MISSING")
      }

      if (
        order.status !== "payment_required" ||
        order.paymentStatus !== "unpaid" ||
        order.squareExpectedAmountCents !== verifiedBinding.amountCents ||
        (order.squarePaymentId &&
          order.squarePaymentId !== verifiedBinding.squarePaymentId) ||
        (order.squareOrderId &&
          order.squareOrderId !== verifiedBinding.squareOrderId) ||
        reservation.status !== "claim_pending" ||
        !reservation.attemptClaimedAt ||
        reservation.idempotencyKey !== purchaseKey ||
        reservation.claimedByDocumentType !== "order" ||
        String(reservation.claimedByDocumentId) !== id ||
        operation.status !== "completed" ||
        !operation.squareCreationAttemptClaimedAt ||
        operation.amountCents !== verifiedBinding.amountCents ||
        operation.squareOrderId !== verifiedBinding.squareOrderId
      ) {
        throw new Error("INCONSISTENT_PURCHASE_STATE")
      }

      if (typeof afterReads === "function") {
        await afterReads()
      }

      // Writes to both validated records force MongoDB to
      // detect conflicting concurrent modifications.
      const r = await Reservation.updateOne({
        _id: reservation._id,
        environment: "production",
        status: "claim_pending",
        idempotencyKey: purchaseKey,
        claimedByDocumentType: "order",
        claimedByDocumentId: new mongoose.Types.ObjectId(id),
        attemptClaimedAt: { $ne: null }
      }, {
        $currentDate: { updatedAt: true }
      }, { session })

      if (r.matchedCount !== 1) {
        throw new Error("RESERVATION_CHANGED")
      }

      const p = await PaymentOperation.updateOne({
        _id: operation._id,
        environment: "production",
        idempotencyKey: purchaseKey,
        status: "completed",
        squareOrderId: verifiedBinding.squareOrderId,
        amountCents: verifiedBinding.amountCents,
        squareCreationAttemptClaimedAt: { $ne: null }
      }, {
        $currentDate: { updatedAt: true }
      }, { session })

      if (p.matchedCount !== 1) {
        throw new Error("PAYMENT_OPERATION_CHANGED")
      }

      const now = new Date()

      const o = await Order.updateOne({
        _id: new mongoose.Types.ObjectId(id),
        squareEnvironment: "production",
        status: "payment_required",
        paymentStatus: "unpaid",
        squareExpectedAmountCents: verifiedBinding.amountCents,
        squarePaymentId: { $in: [null, ""] },
        squareOrderId: {
          $in: [null, "", verifiedBinding.squareOrderId]
        }
      }, {
        $set: {
          status: "paid",
          paymentStatus: "paid",
          paymentMethod: "Square",
          squarePaymentId: verifiedBinding.squarePaymentId,
          squareOrderId: verifiedBinding.squareOrderId,
          paidAt: now
        }
      }, { session })

      if (o.modifiedCount !== 1) {
        throw new Error("ORDER_PAYMENT_UPDATE_BLOCKED")
      }

      recorded = true
    }, { maxCommitTimeMS: 5000 })

    return Object.freeze({
      recorded,
      purchaseKey,
      squareCreationAuthorized: false,
      retryAuthorized: false
    })
  } finally {
    await session.endSession()
  }
}
