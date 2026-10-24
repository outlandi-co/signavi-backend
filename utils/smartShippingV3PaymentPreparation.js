import { verifyV3CheckoutShipping } from "./smartShippingV3CheckoutVerification.js"

const toCents = (value) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error("Invalid saved order amount.")
  }

  const scaled = value * 100
  const cents = Math.round(scaled)

  if (
    !Number.isSafeInteger(cents) ||
    Math.abs(scaled - cents) > 0.000001
  ) {
    throw new Error("Invalid saved order currency precision.")
  }

  return cents
}

export const prepareV3CheckoutPayment = ({
  order,
  guestToken,
  signedQuote,
  now = Date.now()
}) => {
  if (
    !order ||
    !["store", "cart_drawer"].includes(
      String(order.source || "").toLowerCase()
    ) ||
    !["payment_required", "pending"].includes(
      String(order.status || "").toLowerCase()
    ) ||
    String(order.paymentStatus || "").toLowerCase() !== "unpaid" ||
    order.paymentUrl ||
    order.squarePaymentLinkId ||
    order.squareOrderId
  ) {
    return null
  }

  const shipping = verifyV3CheckoutShipping({
    order,
    guestToken,
    signedQuote,
    now
  })

  if (!shipping) {
    return null
  }

  try {
    const subtotalCents = toCents(order.subtotal)
    const taxCents = toCents(order.tax)

    const totalCents =
      subtotalCents +
      taxCents +
      shipping.shippingAmountCents

    if (
      !Number.isSafeInteger(totalCents) ||
      totalCents <= 0
    ) {
      return null
    }

    return {
      orderId: String(order._id),
      subtotalCents,
      taxCents,
      shippingAmountCents: shipping.shippingAmountCents,
      totalCents,
      parcelRateIds: shipping.parcelRateIds,
      carrier: shipping.carrier,
      serviceToken: shipping.serviceToken,
      quoteExpiresAt: shipping.expiresAt
    }
  } catch {
    return null
  }
}