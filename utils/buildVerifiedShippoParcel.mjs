import {
  isSupportedUspsFlatRateTemplate
} from "./shippoParcelTemplatesV3.js"

// Pure request builder. No database, carrier, or payment access.
export function buildVerifiedShippoParcel({ parcel, packaging }) {
  if (
    !parcel ||
    !packaging ||
    typeof parcel !== "object" ||
    typeof packaging !== "object" ||
    Array.isArray(parcel) ||
    Array.isArray(packaging)
  ) {
    throw new Error("Verified parcel and packaging required.")
  }

  const weight = Number(parcel.weight)

  if (
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 2400 ||
    parcel.mass_unit !== "oz"
  ) {
    throw new Error("Invalid verified parcel weight.")
  }

  const shippingWeight = String(parcel.weight)
  const template = packaging.shippoParcelTemplate

  if (
    packaging.uspsFlatRate !== true &&
    packaging.uspsFlatRate !== false
  ) {
    throw new Error("Packaging rate classification missing.")
  }

  if (packaging.uspsFlatRate === true) {
    if (
      packaging.carrier !== "USPS" ||
      !isSupportedUspsFlatRateTemplate(template)
    ) {
      throw new Error("Unverified USPS Flat Rate template.")
    }

    // A carrier-provided Shippo template supplies dimensions.
    // Preserve the independently verified packed weight.
    return {
      template,
      weight: shippingWeight,
      mass_unit: "oz"
    }
  }

  if (template !== "") {
    throw new Error("Ordinary parcel cannot use carrier template.")
  }

  const dimensions = [
    parcel.length,
    parcel.width,
    parcel.height
  ]

  if (
    parcel.distance_unit !== "in" ||
    dimensions.some(value =>
      !Number.isFinite(Number(value)) ||
      Number(value) <= 0 ||
      Number(value) > 120
    )
  ) {
    throw new Error("Invalid parcel dimensions.")
  }

  return {
    length: String(parcel.length),
    width: String(parcel.width),
    height: String(parcel.height),
    distance_unit: "in",
    weight: shippingWeight,
    mass_unit: "oz"
  }
}