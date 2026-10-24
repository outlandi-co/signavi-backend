import { verifyGuestCheckoutToken } from "./guestCheckoutToken.js"
import { createV3OrderFingerprint } from "./smartShippingV3OrderFingerprint.js"
import { verifyV3SignedQuote } from "./smartShippingV3QuoteSigning.js"

export const verifyV3CheckoutShipping = ({
  order,
  guestToken,
  signedQuote,
  now = Date.now()
}) => {
  if (!order || !order._id) {
    return null
  }

  // Authorization must succeed before a shipping quote
  // is accepted for this saved order.
  if (!verifyGuestCheckoutToken(order, guestToken)) {
    return null
  }

  try {
    const cartFingerprint =
      createV3OrderFingerprint(order)

    const quote = verifyV3SignedQuote({
      token: signedQuote,
      cartFingerprint,
      now
    })

    if (!quote) {
      return null
    }

    return {
      orderId: String(order._id),
      shippingAmountCents: quote.shippingAmountCents,
      parcelRateIds: quote.parcelRateIds,
      carrier: quote.carrier,
      serviceToken: quote.serviceToken,
      expiresAt: quote.expiresAt
    }
  } catch {
    return null
  }
}