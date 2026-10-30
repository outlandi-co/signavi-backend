const blocked = reason => Object.freeze({
  verified: false,
  reason,
  squareRequestAuthorized: false
})

const cents = value => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }

  const result = Math.round(value * 100)

  if (
    !Number.isSafeInteger(result) ||
    Math.abs(value * 100 - result) > 0.000001
  ) {
    return null
  }

  return result
}

/**
 * Verifies prepared V3 amounts against an already-saved order.
 *
 * It does not authenticate checkout, verify the signed quote,
 * persist changes, or authorize Square execution.
 */
export function verifyV3TrustedCheckoutAmount({
  order,
  prepared
} = {}) {
  if (
    !order ||
    !prepared ||
    String(order._id || "") !== prepared.orderId
  ) {
    return blocked("ORDER_IDENTITY_MISMATCH")
  }

  const fields = [
    ["subtotal", "subtotalCents"],
    ["tax", "taxCents"],
    ["shipping", "shippingAmountCents"],
    ["finalPrice", "totalCents"]
  ]

  for (const [orderField, preparedField] of fields) {
    const expected = prepared[preparedField]
    const actual = cents(order[orderField])

    if (
      !Number.isSafeInteger(expected) ||
      actual === null ||
      actual !== expected
    ) {
      return blocked("CHECKOUT_AMOUNT_MISMATCH")
    }
  }

  if (
    prepared.subtotalCents < 0 ||
    prepared.taxCents < 0 ||
    prepared.shippingAmountCents <= 0 ||
    prepared.totalCents <= 0 ||
    prepared.totalCents !==
      prepared.subtotalCents +
      prepared.taxCents +
      prepared.shippingAmountCents
  ) {
    return blocked("CHECKOUT_TOTAL_INCONSISTENT")
  }

  for (const field of [
    "shippingCost",
    "shippingTotal",
    "deliveryFee"
  ]) {
    if (
      cents(order[field]) !== prepared.shippingAmountCents
    ) {
      return blocked("SHIPPING_FIELD_MISMATCH")
    }
  }

  return Object.freeze({
    verified: true,
    orderId: prepared.orderId,
    amountCents: prepared.totalCents,
    squareRequestAuthorized: false
  })
}