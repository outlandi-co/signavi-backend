/**
 * ISOLATED TEST ONLY.
 *
 * Reads durable order state after an uncertain transaction.
 * Does not contact Square or change any database record.
 *
 * This is NOT a substitute for verifying the Square payment
 * through an authenticated Square API lookup.
 */
export async function reconcileV3ProductionPaymentOutcomeIsolated({
  orderId,
  Order,
  squarePaymentId,
  squareOrderId,
  amountCents
} = {}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  const id = String(orderId ?? "").toLowerCase()

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    typeof Order?.findById !== "function" ||
    typeof squarePaymentId !== "string" ||
    !squarePaymentId.trim() ||
    typeof squareOrderId !== "string" ||
    !squareOrderId.trim() ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    throw new Error("RECONCILIATION_INPUT_INVALID")
  }

  const result = (outcome, reason) => Object.freeze({
    outcome,
    reason,
    recorded: false,
    paymentCreationAuthorized: false,
    retryAuthorized: false,
    databaseWriteAuthorized: false
  })

  let order

  try {
    const query = Order.findById(id)
    order = await query.lean()
  } catch {
    return result(
      "unknown",
      "DATABASE_LOOKUP_FAILED"
    )
  }

  if (!order) {
    return result(
      "unknown",
      "ORDER_NOT_FOUND"
    )
  }

  if (
    String(order._id) !== id ||
    order.squareEnvironment !== "production"
  ) {
    return result(
      "hold",
      "ORDER_IDENTITY_MISMATCH"
    )
  }

  if (
    order.status === "paid" &&
    order.paymentStatus === "paid"
  ) {
    if (
      order.squarePaymentId === squarePaymentId &&
      order.squareOrderId === squareOrderId &&
      order.squareExpectedAmountCents === amountCents
    ) {
      return result(
        "matching_payment_recorded",
        "EXACT_DURABLE_PAYMENT_MATCH"
      )
    }

    return result(
      "hold",
      "CONFLICTING_PAID_PAYMENT"
    )
  }

  if (
    order.status === "payment_required" &&
    order.paymentStatus === "unpaid"
  ) {
    return result(
      "unknown",
      "PAYMENT_NOT_RECORDED"
    )
  }

  return result(
    "hold",
    "UNEXPECTED_ORDER_STATE"
  )
}
