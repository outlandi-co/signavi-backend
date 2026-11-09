
/*
 * SIGNAVI.SHIPPING.016
 * MOCK SHIPPING ? LOCAL SANDBOX ONLY
 *
 * These dimensions, tare weights and capacities are assumptions.
 * They are NOT verified physical packaging specifications.
 * Never use these parcels to charge customers, obtain production
 * shipping quotes, purchase labels, or activate checkout.
 */

export const MOCK_PACKAGES = Object.freeze([
  {
    id: "mock-poly-small",
    name: "Mock Small Poly Mailer",
    type: "mailer",
    lengthIn: 10,
    widthIn: 13,
    heightIn: null,
    tareWeightOz: 0.5,
    maxShirts: 1,
    verified: false
  },
  {
    id: "mock-poly-large",
    name: "Mock Large Poly Mailer",
    type: "mailer",
    lengthIn: 14,
    widthIn: 19,
    heightIn: null,
    tareWeightOz: 1,
    maxShirts: 3,
    verified: false
  },
  {
    id: "mock-box-small",
    name: "Mock Small Shipping Box",
    type: "box",
    lengthIn: 12,
    widthIn: 10,
    heightIn: 4,
    tareWeightOz: 8,
    maxShirts: 6,
    verified: false
  },
  {
    id: "mock-box-medium",
    name: "Mock Medium Shipping Box",
    type: "box",
    lengthIn: 16,
    widthIn: 12,
    heightIn: 6,
    tareWeightOz: 12,
    maxShirts: 12,
    verified: false
  },
  {
    id: "mock-box-large",
    name: "Mock Large Shipping Box",
    type: "box",
    lengthIn: 20,
    widthIn: 16,
    heightIn: 10,
    tareWeightOz: 20,
    maxShirts: 20,
    verified: false
  }
])

function assertSandbox() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SIGNAVI_MOCK_SHIPPING !== "enabled"
  ) {
    throw new Error("MOCK_PACKAGING_SANDBOX_ONLY")
  }
}

function chooseBox(count) {
  if (count <= 6) return MOCK_PACKAGES[2]
  if (count <= 12) return MOCK_PACKAGES[3]
  return MOCK_PACKAGES[4]
}

function makeParcel(pack, quantity, unitWeightOz) {
  return {
    mock: true,
    verified: false,
    packageId: pack.id,
    packageName: pack.name,
    packagingType: pack.type,
    quantity,
    unitWeightOz,
    productWeightOz: quantity * unitWeightOz,
    tareWeightOz: pack.tareWeightOz,
    totalWeightOz: quantity * unitWeightOz + pack.tareWeightOz,
    lengthIn: pack.lengthIn,
    widthIn: pack.widthIn,
    heightIn: pack.heightIn,
    dimensionsVerified: false,
    capacityVerified: false,
    carrierEligible: false
  }
}

export function simulateShirtPackaging({
  quantity,
  unitWeightOz
}) {
  assertSandbox()

  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new Error("INVALID_SHIRT_QUANTITY")
  }

  if (
    typeof unitWeightOz !== "number" ||
    !Number.isFinite(unitWeightOz) ||
    unitWeightOz <= 0 ||
    unitWeightOz > 2400
  ) {
    throw new Error("INVALID_UNIT_WEIGHT")
  }

  const parcels = []

  if (quantity <= 3) {
    const pack = quantity === 1 ? MOCK_PACKAGES[0] : MOCK_PACKAGES[1]
    parcels.push(makeParcel(pack, quantity, unitWeightOz))
  } else {
    let remaining = quantity

    while (remaining > 0) {
      const units = Math.min(remaining, 20)
      const pack = chooseBox(units)
      parcels.push(makeParcel(pack, units, unitWeightOz))
      remaining -= units
    }
  }

  const totalProductWeightOz = quantity * unitWeightOz
  const totalPackagingWeightOz = parcels.reduce(
    (sum, parcel) => sum + parcel.tareWeightOz, 0
  )

  return {
    mode: "sandbox-mock",
    verified: false,
    checkoutEligible: false,
    productionRatesAllowed: false,
    quantity,
    unitWeightOz,
    packageCount: parcels.length,
    totalProductWeightOz,
    totalPackagingWeightOz,
    totalShipmentWeightOz:
      totalProductWeightOz + totalPackagingWeightOz,
    parcels,
    warning:
      "SIMULATION ONLY ? unverified packaging; not usable for customer charges or carrier labels."
  }
}
