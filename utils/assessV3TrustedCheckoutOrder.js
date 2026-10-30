const blocked = reason => Object.freeze({
  eligible: false,
  reason,
  squareRequestAuthorized: false
})

const hasValue = value =>
  value !== null &&
  value !== undefined &&
  String(value).trim() !== ""

const legacyFields = [
  "paymentUrl",
  "squarePaymentId",
  "squareOrderId",
  "squarePaymentLinkId",
  "paymentUrlCreatedAt"
]

/**
 * Order-level eligibility only.
 *
 * This is NOT HTTP authentication, proof of guest ownership,
 * permission to create a Square link, or historical-payment
 * reconciliation. The caller must enforce those separately.
 */
export function assessV3TrustedCheckoutOrder(order) {
  if (!order || typeof order !== "object") {
    return blocked("ORDER_REQUIRED")
  }

  const orderId = String(order._id || "").toLowerCase()

  if (!/^[a-f0-9]{24}$/.test(orderId)) {
    return blocked("INVALID_ORDER_ID")
  }

  if (order.status !== "payment_required") {
    return blocked("ORDER_NOT_PAYMENT_READY")
  }

  const paymentStatus = String(
    order.paymentStatus || ""
  ).trim().toLowerCase()

  // Only explicitly unpaid states are eligible.
  if (!["pending", "unpaid", "payment_required"].includes(paymentStatus)) {
    return blocked("PAYMENT_STATUS_NOT_ELIGIBLE")
  }

  if (legacyFields.some(field => hasValue(order[field]))) {
    return blocked("EXISTING_PAYMENT_EVIDENCE")
  }

  const total = order.finalPrice

  // A stored numeric dollar amount is required.
  if (
    typeof total !== "number" ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return blocked("INVALID_SERVER_SAVED_TOTAL")
  }

  const cents = Math.round(total * 100)

  if (
    !Number.isSafeInteger(cents) ||
    cents < 1 ||
    Math.abs(total * 100 - cents) > 0.000001
  ) {
    return blocked("INVALID_PAYMENT_CENTS")
  }

  return Object.freeze({
    eligible: true,
    orderId,
    amountCents: cents,
    squareRequestAuthorized: false
  })
}