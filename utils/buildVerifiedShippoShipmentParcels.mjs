import {
  buildVerifiedShippoParcel
} from "./buildVerifiedShippoParcel.mjs"

// All packaging records must originate from trusted
// server-side fulfillment data, never browser input.
//
// This prepares parcel objects only. It does not
// authorize carrier rates or purchases.
export function buildVerifiedShippoShipmentParcels(entries) {
  if (
    !Array.isArray(entries) ||
    entries.length < 1 ||
    entries.length > 10
  ) {
    throw new Error("Invalid verified shipment parcel count.")
  }

  const parcels = []

  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !entry.parcel ||
      !entry.packaging
    ) {
      throw new Error("Missing trusted parcel packaging pairing.")
    }

    const parcel = buildVerifiedShippoParcel({
      parcel: entry.parcel,
      packaging: entry.packaging
    })

    parcels.push(parcel)
  }

  return parcels
}