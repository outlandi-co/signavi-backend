import { calculateVerifiedApparelParcels } from "./smartShippingV3Service.js"
import { quoteV3Parcels } from "./smartShippingV3QuoteService.js"
import { selectV3ShippingOptions } from "./smartShippingV3Options.js"
import { validateV3CombinedQuote } from "./smartShippingV3QuoteIntegrity.js"

// Internal development workflow.
// Product weights must come from trusted backend records.
// Do not expose directly to customer-supplied request data.
export const calculateV3ApparelShipping = async ({
  quantity,
  unitWeightOz,
  packagingType = "mailer",
  shipSeparately = false,
  from,
  to,
  token,
  carrierAccountIds = [],
  requestShipment
}) => {
  // The quote service currently supports at most ten parcels.
  const packing = await calculateVerifiedApparelParcels({
    quantity,
    unitWeightOz,
    packagingType,
    shipSeparately,
    maxParcels: 10
  })

  if (packing.error) {
    return {
      success: false,
      message: packing.error
    }
  }

  if (
    !packing.success ||
    !Array.isArray(packing.parcels) ||
    packing.parcels.length < 1 ||
    packing.parcels.length > 10
  ) {
    return {
      success: false,
      message: "No valid V3 parcel plan is available."
    }
  }

  const quote = await quoteV3Parcels({
    from,
    to,
    parcels: packing.parcels,
    token,
    carrierAccountIds,
    requestShipment
  })

  if (!quote.rates.length) {
    return {
      success: false,
      message: "No complete carrier rates are available.",
      parcelCount: packing.parcelCount
    }
  }

  const verifiedRates = quote.rates.filter((rate) =>
    validateV3CombinedQuote(rate, packing.parcelCount)
  )
  return {
    success: true,
    totalUnits: packing.totalUnits,
    parcelCount: packing.parcelCount,
    parcels: packing.parcels,
    rates: verifiedRates,
    shippingOptions: selectV3ShippingOptions(
      verifiedRates,
      packing.parcelCount
    ),
    messages: quote.messages
  }
}