import { simulateProductAwarePacking } from "./mockProductAwarePacking.mjs"

// SIGNAVI.SHIPPING.024
// Sandbox-only cart simulation using backend-style product fixtures.
// No MongoDB queries, Shippo requests, customer charges or checkout writes.
// This is per-product simulation, NOT verified mixed-item co-packing.

export function simulateMixedCartPacking(items) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SIGNAVI_MOCK_SHIPPING !== "enabled"
  ) {
    throw new Error("MOCK_PACKAGING_SANDBOX_ONLY")
  }

  if (!Array.isArray(items) || items.length < 1 || items.length > 200) {
    throw new Error("INVALID_MOCK_CART")
  }

  const seen = new Set()
  let totalQuantity = 0
  let totalProductWeightOz = 0
  let simulatedParcelWeightOz = 0

  const parcels = []
  const reviewItems = []
  const itemResults = []

  for (const entry of items) {
    const product = entry?.product
    const quantity = entry?.quantity
    const id = product?.id

    if (typeof id !== "string" || !id.trim()) {
      throw new Error("INVALID_PRODUCT_ID")
    }

    if (seen.has(id)) {
      throw new Error("DUPLICATE_PRODUCT_ID")
    }

    seen.add(id)

    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 200
    ) {
      throw new Error("INVALID_QUANTITY")
    }

    totalQuantity += quantity

    if (totalQuantity > 200) {
      throw new Error("MOCK_CART_UNIT_LIMIT")
    }

    if (product.productType !== "physical") {
      throw new Error("PHYSICAL_PRODUCT_REQUIRED")
    }

    const weightOz = product.shipping?.weightOz

    if (
      typeof weightOz !== "number" ||
      !Number.isFinite(weightOz) ||
      weightOz <= 0 ||
      weightOz > 2400
    ) {
      throw new Error("INVALID_PRODUCT_UNIT_WEIGHT")
    }

    const productWeightOz = quantity * weightOz
    totalProductWeightOz += productWeightOz

    const result = simulateProductAwarePacking(product, quantity)

    if (
      result.requiresManualReview ||
      !Array.isArray(result.parcels) ||
      result.parcels.length === 0
    ) {
      reviewItems.push({
        productId: id,
        shippingClass: product.shippingClass || "unclassified",
        quantity,
        productWeightOz,
        reason: result.reason || "PACKING_UNAVAILABLE"
      })

      itemResults.push({
        productId: id,
        quantity,
        status: "manual-review"
      })

      continue
    }

    for (const parcel of result.parcels) {
      // Defensive check: no mock parcel can be sent to carrier checkout.
      if (
        parcel.mock !== true ||
        parcel.verified !== false ||
        parcel.carrierEligible !== false ||
        !Number.isFinite(parcel.totalWeightOz)
      ) {
        throw new Error("UNSAFE_MOCK_PARCEL")
      }

      parcels.push({
        ...parcel,
        productId: id
      })

      simulatedParcelWeightOz += parcel.totalWeightOz
    }

    itemResults.push({
      productId: id,
      quantity,
      status: "simulated"
    })
  }

  const requiresManualReview = reviewItems.length > 0

  return {
    mode: "sandbox-mock",
    mock: true,
    verified: false,
    checkoutEligible: false,
    productionRatesAllowed: false,
    carrierEligible: false,
    mixedItemCoPackingVerified: false,
    requiresManualReview,
    totalQuantity,
    totalProductWeightOz,
    simulatedParcelWeightOz,
    // A complete shipment weight is unknown if any line needs review.
    completeShipmentWeightOz:
      requiresManualReview ? null : simulatedParcelWeightOz,
    simulatedParcelCount: parcels.length,
    parcels,
    reviewItems,
    itemResults,
    warning:
      "SIMULATION ONLY. No verified mixed-item packing, live rates, customer charges or labels."
  }
}
