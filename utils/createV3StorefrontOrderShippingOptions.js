import { verifyGuestCheckoutToken } from "./guestCheckoutToken.js"
import { createV3OrderFingerprint } from "./smartShippingV3OrderFingerprint.js"
import { combineV3ParcelRates } from "./smartShippingV3Rates.js"
import { selectV3ShippingOptions } from "./smartShippingV3Options.js"
import { signV3ShippingOptions } from "./smartShippingV3SignedOptions.js"

export const createV3StorefrontOrderShippingOptions = ({
  order,
  guestToken,
  trustedShipments,
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

  if (!verifyGuestCheckoutToken(order, guestToken)) {
    return null
  }

  if (
    !Array.isArray(trustedShipments) ||
    trustedShipments.length < 1 ||
    trustedShipments.length > 10 ||
    trustedShipments.some(
      shipment =>
        !shipment ||
        !Array.isArray(shipment.rates)
    )
  ) {
    return null
  }

  const cartFingerprint = createV3OrderFingerprint(order)

  const parcelCount = trustedShipments.length

  const verifiedRates = combineV3ParcelRates(
    trustedShipments
  )

  const options = selectV3ShippingOptions(
    verifiedRates,
    parcelCount
  )

  if (options.length === 0) {
    return null
  }

  const signedOptions = signV3ShippingOptions({
    options,
    verifiedRates,
    parcelCount,
    cartFingerprint,
    now
  })

  if (signedOptions.length === 0) {
    return null
  }

  return {
    orderId: String(order._id),
    parcelCount,
    shippingOptions: signedOptions
  }
}