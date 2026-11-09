import {
  buildVerifiedShippoShipmentParcels
} from "./buildVerifiedShippoShipmentParcels.mjs"

// This function validates an in-process rate selection against
// the original ordered carrier responses.
//
// It does not authorize a purchase, prove physical package fit,
// or establish USPS Flat Rate eligibility.
const toCents = value => {
  const text = String(value ?? "")

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null
  }

  const [dollars, fraction = ""] = text.split(".")
  const cents =
    Number(dollars) * 100 +
    Number(fraction.padEnd(2, "0"))

  return Number.isSafeInteger(cents) && cents > 0
    ? cents
    : null
}

const serviceKey = rate => {
  const carrier = String(rate?.provider || "").trim()
  const account = String(rate?.carrier_account || "").trim()
  const service = String(rate?.servicelevel?.token || "").trim()

  return carrier && account && service
    ? JSON.stringify([carrier, account, service])
    : null
}

export function verifyV3CarrierRateProvenance({
  parcelEntries,
  shipments,
  combinedRate
} = {}) {
  try {
    if (
      !Array.isArray(parcelEntries) ||
      !Array.isArray(shipments) ||
      shipments.length !== parcelEntries.length ||
      shipments.length < 1 ||
      shipments.length > 10 ||
      !combinedRate ||
      !Array.isArray(combinedRate.parcelRateIds) ||
      !Array.isArray(combinedRate.parcelRates) ||
      combinedRate.parcelRateIds.length !== shipments.length ||
      combinedRate.parcelRates.length !== shipments.length
    ) {
      return false
    }

    // Validate the underlying parcel-and-package pairs.
    buildVerifiedShippoShipmentParcels(parcelEntries)

    // Flat Rate must wait for independent carrier-template
    // and service-eligibility verification.
    if (parcelEntries.some(entry =>
      !/^[a-f0-9]{24}$/i.test(
        String(entry?.packaging?.id ?? "")
      ) ||
      entry?.packaging?.uspsFlatRate !== false ||
      entry?.packaging?.shippoParcelTemplate !== ""
    )) {
      return false
    }

    const expectedService = serviceKey(combinedRate)

    if (
      !expectedService ||
      String(combinedRate.currency || "").toUpperCase() !== "USD"
    ) {
      return false
    }

    let totalCents = 0
    const seenIds = new Set()

    for (let i = 0; i < shipments.length; i++) {
      const shipment = shipments[i]
      const expectedId = combinedRate.parcelRateIds[i]
      const selected = combinedRate.parcelRates[i]

      if (
        typeof expectedId !== "string" ||
        expectedId.length === 0 ||
        seenIds.has(expectedId) ||
        !Array.isArray(shipment?.rates) ||
        !selected ||
        selected.object_id !== expectedId ||
        serviceKey(selected) !== expectedService ||
        String(selected.currency || "").toUpperCase() !== "USD"
      ) {
        return false
      }

      const matches = shipment.rates.filter(rate =>
        rate?.object_id === expectedId
      )

      // One and only one corresponding carrier rate.
      if (matches.length !== 1) {
        return false
      }

      const actual = matches[0]
      const cents = toCents(actual.amount)

      if (
        serviceKey(actual) !== expectedService ||
        String(actual.currency || "").toUpperCase() !== "USD" ||
        cents === null ||
        cents !== toCents(selected.amount)
      ) {
        return false
      }

      seenIds.add(expectedId)
      totalCents += cents

      if (!Number.isSafeInteger(totalCents)) {
        return false
      }
    }

    return (
      toCents(combinedRate.amount) === totalCents &&
      seenIds.size === shipments.length
    )
  } catch {
    return false
  }
}