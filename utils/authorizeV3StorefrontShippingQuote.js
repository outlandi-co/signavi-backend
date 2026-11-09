import { verifyGuestCheckoutToken } from "./guestCheckoutToken.js"
import { createV3OrderFingerprint } from "./smartShippingV3OrderFingerprint.js"

export const authorizeV3StorefrontShippingQuote = ({
  order,
  guestToken
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

  if (!verifyGuestCheckoutToken(order, guestToken)) {
    return null
  }

  try {
    const fingerprint = createV3OrderFingerprint(order)

    return Object.freeze({
      orderId: String(order._id),
      fingerprint
    })
  } catch {
    return null
  }
}