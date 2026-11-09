/*
 * SIGNAVI.SHIPPING.025
 * HYPOTHETICAL specialty packaging for LOCAL testing only.
 * No real packing verification, Shippo rates, labels or checkout.
 */

export const MOCK_SPECIALTY_PACKAGES = Object.freeze({
  protected: Object.freeze({
    id: "mock-protective-box",
    name: "Mock Protective Keytag Box",
    lengthIn: 8,
    widthIn: 6,
    heightIn: 4,
    tareWeightOz: 4,
    capacity: 25,
    verified: false
  }),
  oversized: Object.freeze({
    id: "mock-oversized-carton",
    name: "Mock Oversized Canopy Carton",
    lengthIn: 48,
    widthIn: 12,
    heightIn: 12,
    tareWeightOz: 32,
    capacity: 1,
    verified: false
  })
})

export function simulateSpecialtyPackaging({
  shippingClass,
  quantity,
  unitWeightOz,
  shipping = {}
}) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SIGNAVI_MOCK_SHIPPING !== "enabled"
  ) {
    throw new Error("MOCK_PACKAGING_SANDBOX_ONLY")
  }

  if (!["protected", "oversized"].includes(shippingClass)) {
    throw new Error("UNSUPPORTED_SPECIALTY_CLASS")
  }

  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 200) {
    throw new Error("INVALID_QUANTITY")
  }

  if (
    typeof unitWeightOz !== "number" ||
    !Number.isFinite(unitWeightOz) ||
    unitWeightOz <= 0 ||
    unitWeightOz > 2400
  ) {
    throw new Error("INVALID_UNIT_WEIGHT")
  }

  if (
    !shipping ||
    typeof shipping !== "object" ||
    Array.isArray(shipping)
  ) {
    throw new Error("INVALID_SHIPPING_RULES")
  }

  const mode = shipping.compatibilityMode ||
    (shipping.shipSeparately === true ? "separate" : "combine")

  if (shippingClass === "protected") {
    if (
      mode !== "protected" ||
      shipping.requiresProtection !== true ||
      shipping.shipSeparately === true ||
      shipping.oversized === true
    ) {
      throw new Error("PROTECTIVE_PACKING_RULES_INCONSISTENT")
    }
  }

  if (shippingClass === "oversized") {
    if (
      mode !== "separate" ||
      shipping.shipSeparately !== true ||
      shipping.oversized !== true
    ) {
      throw new Error("OVERSIZED_PACKING_RULES_INCONSISTENT")
    }
  }

  const pack = MOCK_SPECIALTY_PACKAGES[shippingClass]

  if (
    shipping.maxUnitsPerPackage != null &&
    (
      !Number.isSafeInteger(shipping.maxUnitsPerPackage) ||
      shipping.maxUnitsPerPackage < 1
    )
  ) {
    throw new Error("INVALID_PACKAGE_CAPACITY")
  }

  const limit = Math.min(
    pack.capacity,
    shipping.maxUnitsPerPackage ?? pack.capacity
  )

  const parcels = []
  let remaining = quantity

  while (remaining > 0) {
    const units = Math.min(remaining, limit)
    const totalWeightOz = units * unitWeightOz + pack.tareWeightOz

    if (totalWeightOz > 2400) {
      throw new Error("MOCK_PACKAGE_WEIGHT_LIMIT")
    }

    parcels.push({
      mock: true,
      verified: false,
      carrierEligible: false,
      packageId: pack.id,
      packageName: pack.name,
      shippingClass,
      quantity: units,
      productWeightOz: units * unitWeightOz,
      tareWeightOz: pack.tareWeightOz,
      totalWeightOz,
      lengthIn: pack.lengthIn,
      widthIn: pack.widthIn,
      heightIn: pack.heightIn,
      dimensionsVerified: false,
      capacityVerified: false
    })

    remaining -= units

    if (parcels.length > 200) {
      throw new Error("MOCK_PACKAGE_COUNT_LIMIT")
    }
  }

  return {
    mode: "sandbox-mock",
    mock: true,
    verified: false,
    shippingClass,
    requiresManualReview: true,
    checkoutEligible: false,
    productionRatesAllowed: false,
    totalProductWeightOz: quantity * unitWeightOz,
    hypotheticalPackedWeightOz: parcels.reduce(
      (sum, parcel) => sum + parcel.totalWeightOz,
      0
    ),
    parcels,
    warning:
      "Unverified specialty packaging estimates. Manual review is required."
  }
}