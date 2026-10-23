const validPositive = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0

const validNonNegative = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0

const specialTypes = new Set(["fragile", "oversized"])

const compatible = (productType, packageType) => {
  if (specialTypes.has(productType)) {
    return packageType === productType
  }

  return !specialTypes.has(packageType)
}

export const packVerifiedApparel = ({
  quantity,
  unitWeightOz,
  packagingType = "mailer",
  shipSeparately = false,
  packages = [],
  maxParcels = 100
}) => {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 200 ||
    !validPositive(unitWeightOz) ||
    !Number.isInteger(maxParcels) ||
    maxParcels < 1 ||
    !Array.isArray(packages)
  ) {
    return { error: "Invalid packing input." }
  }

  const candidates = []

  for (const pkg of packages) {
    if (!pkg || pkg.active !== true) continue

    if (!compatible(packagingType, pkg.type)) continue

    // Reject inconsistent USPS Flat Rate configuration.
    const flatRate = pkg.uspsFlatRate === true
    const template = String(
      pkg.shippoParcelTemplate || ""
    ).trim()

    if (flatRate) {
      if (pkg.carrier !== "USPS" || !template) continue
    } else if (template) {
      continue
    }

    const capacity = pkg.verifiedShirtCapacity

    if (!Number.isInteger(capacity) || capacity < 1) continue

    const tare = pkg.tareWeightOz
    const maxWeight = pkg.maxWeightOz

    if (
      !validNonNegative(tare) ||
      !validPositive(maxWeight) ||
      tare >= maxWeight
    ) {
      continue
    }

    const dimensions = [
      pkg.lengthIn,
      pkg.widthIn,
      pkg.heightIn
    ]

    if (!dimensions.every(validPositive)) continue

    // Require an independently verified packing capacity.
    const byWeight = Math.floor(
      (maxWeight - tare) / unitWeightOz
    )

    const perParcel = Math.min(
      shipSeparately ? 1 : capacity,
      byWeight
    )

    if (perParcel < 1) continue

    const parcelCount = Math.ceil(quantity / perParcel)

    if (parcelCount > maxParcels) continue

    candidates.push({
      pkg,
      perParcel,
      parcelCount,
      volume:
        pkg.lengthIn * pkg.widthIn * pkg.heightIn
    })
  }

  candidates.sort(
    (a, b) =>
      a.parcelCount - b.parcelCount ||
      a.volume - b.volume
  )

  const choice = candidates[0]

  if (!choice) {
    return {
      error: "No suitable verified packaging is available."
    }
  }

  const parcels = []
  let remaining = quantity

  while (remaining > 0) {
    const units = Math.min(remaining, choice.perParcel)

    const weightOz = Math.ceil(
      choice.pkg.tareWeightOz +
      units * unitWeightOz
    )

    parcels.push({
      packageId: String(choice.pkg._id || ""),
      packageName: choice.pkg.name,
      quantity: units,
      length: String(choice.pkg.lengthIn),
      width: String(choice.pkg.widthIn),
      height: String(choice.pkg.heightIn),
      distance_unit: "in",
      weight: String(weightOz),
      mass_unit: "oz",
      carrier: choice.pkg.carrier,
      uspsFlatRate: choice.pkg.uspsFlatRate === true,
      shippoParcelTemplate:
        choice.pkg.shippoParcelTemplate || ""
    })

    remaining -= units
  }

  return {
    success: true,
    totalUnits: quantity,
    parcelCount: parcels.length,
    parcels
  }
}