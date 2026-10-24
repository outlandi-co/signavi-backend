const toCents = (amount) => {
  if (typeof amount !== "string") return null
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) return null

  const [dollars, cents = ""] = amount.split(".")

  const total =
    Number(dollars) * 100 +
    Number(cents.padEnd(2, "0"))

  return Number.isSafeInteger(total) && total > 0
    ? total
    : null
}

export const validateV3CombinedQuote = (
  rate,
  expectedParcelCount
) => {
  if (
    !rate ||
    !Number.isInteger(expectedParcelCount) ||
    expectedParcelCount < 1
  ) {
    return false
  }

  const ids = rate.parcelRateIds
  const parcels = rate.parcelRates

  if (
    !Array.isArray(ids) ||
    !Array.isArray(parcels) ||
    ids.length !== expectedParcelCount ||
    parcels.length !== expectedParcelCount
  ) {
    return false
  }

  if (new Set(ids).size !== ids.length) {
    return false
  }

  const expectedCarrier = rate.provider
  const expectedAccount = rate.carrier_account
  const expectedService = rate.servicelevel?.token

  if (
    !expectedCarrier ||
    !expectedAccount ||
    !expectedService
  ) {
    return false
  }

  let totalCents = 0

  for (let i = 0; i < parcels.length; i++) {
    const parcel = parcels[i]
    const cents = toCents(parcel?.amount)

    if (
      !parcel ||
      parcel.object_id !== ids[i] ||
      parcel.provider !== expectedCarrier ||
      parcel.carrier_account !== expectedAccount ||
      parcel.servicelevel?.token !== expectedService ||
      String(parcel.currency || "").toUpperCase() !== "USD" ||
      cents === null
    ) {
      return false
    }

    totalCents += cents

    if (!Number.isSafeInteger(totalCents)) {
      return false
    }
  }

  return (
    String(rate.currency || "").toUpperCase() === "USD" &&
    toCents(rate.amount) === totalCents
  )
}