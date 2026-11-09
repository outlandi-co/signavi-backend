const idPattern = /^[a-f0-9]{24}$/i

const positive = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0

const validId = (value) =>
  typeof value === "string" && idPattern.test(value)

const fail = (message) => ({
  error: message,
  parcels: []
})

export function buildVerifiedSavedPackageParcels({
  productId,
  selectedPackageId,
  quantity,
  packages,
  profiles,
  shipSeparately = false
} = {}) {
  if (
    !validId(productId) ||
    !validId(selectedPackageId) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 200 ||
    !Array.isArray(packages) ||
    !Array.isArray(profiles)
  ) {
    return fail("Invalid saved-package shipping request.")
  }

  const id = (value) => String(value ?? "").toLowerCase()

  const selectedPackage = packages.find(
    (box) => id(box?.id) === id(selectedPackageId)
  )

  if (!selectedPackage) {
    return fail("Selected shipping package is unavailable.")
  }

  const box = selectedPackage

  if (
    !positive(box.length) ||
    !positive(box.width) ||
    !positive(box.height) ||
    !positive(box.maxWeight) ||
    typeof box.tare !== "number" ||
    !Number.isFinite(box.tare) ||
    box.tare < 0 ||
    box.length > 120 ||
    box.width > 120 ||
    box.height > 120 ||
    box.maxWeight > 2400 ||
    box.maxWeight <= box.tare
  ) {
    return fail("Selected shipping package has invalid specifications.")
  }

  // Profiles must originate from trusted server-side records.
  const matching = profiles.filter(
    (profile) =>
      id(profile?.productId) === id(productId) &&
      id(profile?.packageId) === id(selectedPackageId) &&
      profile?.active === true
  )

  if (matching.length !== 1) {
    return fail("A unique active verified packing profile is required.")
  }

  const profile = matching[0]

  if (
    !positive(profile.unitWeightOz) ||
    !Number.isSafeInteger(profile.verifiedCapacity) ||
    profile.verifiedCapacity < 1 ||
    typeof profile.verifiedBy !== "string" ||
    !profile.verifiedBy.trim() ||
    typeof profile.verificationNotes !== "string" ||
    profile.verificationNotes.trim().length < 8 ||
    !profile.verifiedAt ||
    !Number.isFinite(new Date(profile.verifiedAt).getTime())
  ) {
    return fail("Verified packing information is incomplete.")
  }

  // STUDIO_058H38B_SAVED_SHIP_SEPARATELY
  if (typeof shipSeparately !== "boolean") {
    return fail("Invalid separate-shipping configuration.")
  }

  const byWeight = Math.floor(
    (box.maxWeight - box.tare) / profile.unitWeightOz
  )

  const perParcel = Math.min(
    shipSeparately ? 1 : profile.verifiedCapacity,
    byWeight
  )

  if (!Number.isSafeInteger(perParcel) || perParcel < 1) {
    return fail("Product exceeds the selected package weight limit.")
  }

  const parcelCount = Math.ceil(quantity / perParcel)

  if (parcelCount > 10) {
    return fail("Order requires more than 10 shipping parcels.")
  }

  const parcels = []
  let remaining = quantity

  while (remaining > 0) {
    const units = Math.min(remaining, perParcel)
    const actualWeight = box.tare + units * profile.unitWeightOz
    const roundedWeight = Math.ceil(actualWeight)

    if (
      !positive(actualWeight) ||
      !Number.isSafeInteger(roundedWeight) ||
      actualWeight > box.maxWeight ||
      roundedWeight > box.maxWeight ||
      roundedWeight > 2400
    ) {
      return fail("Verified parcel exceeds shipping weight limits.")
    }

    parcels.push({
      length: String(box.length),
      width: String(box.width),
      height: String(box.height),
      distance_unit: "in",
      weight: String(roundedWeight),
      mass_unit: "oz"
    })

    remaining -= units
  }

  return {
    parcels,
    packageId: id(selectedPackageId),
    unitsPerParcel: perParcel,
    // Metadata is retained for a future verified carrier
    // template/service integration; do not assume eligibility.
    uspsFlatRate: box.uspsFlatRate === true,
    shippoParcelTemplate: typeof box.shippoParcelTemplate === "string"
      ? box.shippoParcelTemplate
      : ""
  }
}