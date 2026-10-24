import { validateV3CombinedQuote } from "./smartShippingV3QuoteIntegrity.js"
import { createV3SignedQuote } from "./smartShippingV3QuoteSigning.js"

const toCents = (amount) => {
  if (typeof amount !== "string" ||
      !/^\d+(\.\d{1,2})?$/.test(amount)) {
    return null
  }

  const [dollars, cents = ""] = amount.split(".")
  const value = Number(dollars) * 100 +
    Number(cents.padEnd(2, "0"))

  return Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

export const signV3ShippingOptions = ({
  options,
  verifiedRates,
  parcelCount,
  cartFingerprint,
  now = Date.now()
}) => {
  if (!Array.isArray(options) || !Array.isArray(verifiedRates)) {
    throw new Error("Invalid V3 shipping options.")
  }

  return options.map((option) => {
    const matchingRate = verifiedRates.find((rate) =>
      validateV3CombinedQuote(rate, parcelCount) &&
      rate.provider === option.carrier &&
      rate.servicelevel?.token === option.serviceToken &&
      rate.amount === option.amount &&
      rate.currency === option.currency &&
      JSON.stringify(rate.parcelRateIds) ===
        JSON.stringify(option.parcelRateIds)
    )

    if (!matchingRate) {
      throw new Error("Shipping option does not match a verified quote.")
    }

    const shippingAmountCents = toCents(matchingRate.amount)

    if (shippingAmountCents === null) {
      throw new Error("Invalid shipping amount.")
    }

    const signedQuote = createV3SignedQuote({
      cartFingerprint,
      shippingAmountCents,
      parcelRateIds: matchingRate.parcelRateIds,
      carrier: matchingRate.provider,
      serviceToken: matchingRate.servicelevel.token,
      now
    })

    return {
      ...option,
      signedQuote
    }
  })
}