
import { simulateMixedCartPacking } from "./mockMixedCartPacking.mjs"
import { simulateSpecialtyPackaging } from "./mockSpecialtyPackaging.mjs"

// SIGNAVI.SHIPPING.026
// Combines previously tested mock results.
// Nothing returned here is suitable for carrier rates or checkout.

export function simulateCompleteMixedCartPacking(items) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SIGNAVI_MOCK_SHIPPING !== "enabled"
  ) {
    throw new Error("MOCK_PACKAGING_SANDBOX_ONLY")
  }

  const base = simulateMixedCartPacking(items)
  const specialtyParcels = []
  const unresolvedItems = []
  const specialtyResults = []

  for (const review of base.reviewItems) {
    const entry = items.find(
      item => item.product.id === review.productId
    )

    if (!entry) {
      throw new Error("MOCK_PRODUCT_LOOKUP_INCONSISTENT")
    }

    const product = entry.product
    const shippingClass = product.shippingClass

    if (
      shippingClass !== "protected" &&
      shippingClass !== "oversized"
    ) {
      unresolvedItems.push(review)
      continue
    }

    const result = simulateSpecialtyPackaging({
      shippingClass,
      quantity: entry.quantity,
      unitWeightOz: product.shipping.weightOz,
      shipping: product.shipping
    })

    if (
      result.checkoutEligible !== false ||
      result.productionRatesAllowed !== false ||
      result.requiresManualReview !== true ||
      !Array.isArray(result.parcels)
    ) {
      throw new Error("UNSAFE_SPECIALTY_MOCK_RESULT")
    }

    for (const parcel of result.parcels) {
      if (
        parcel.mock !== true ||
        parcel.verified !== false ||
        parcel.carrierEligible !== false ||
        !Number.isFinite(parcel.totalWeightOz) ||
        parcel.totalWeightOz <= 0
      ) {
        throw new Error("UNSAFE_SPECIALTY_MOCK_PARCEL")
      }

      specialtyParcels.push({
        ...parcel,
        productId: product.id
      })
    }

    specialtyResults.push({
      productId: product.id,
      shippingClass,
      quantity: entry.quantity,
      hypotheticalPackedWeightOz:
        result.hypotheticalPackedWeightOz,
      parcelCount: result.parcels.length,
      requiresManualReview: true
    })
  }

  const hypotheticalParcels = [
    ...base.parcels,
    ...specialtyParcels
  ]

  const hypotheticalTotalPackedWeightOz =
    hypotheticalParcels.reduce(
      (sum, parcel) => sum + parcel.totalWeightOz,
      0
    )

  const hasUnresolvedItems = unresolvedItems.length > 0

  return {
    ...base,
    mode: "sandbox-mock",
    mock: true,
    verified: false,
    checkoutEligible: false,
    productionRatesAllowed: false,
    carrierEligible: false,
    mixedItemCoPackingVerified: false,

    // Preserve base's trusted distinction:
    // completeShipmentWeightOz stays null when specialty packing
    // requires manual review.
    completeShipmentWeightOz: base.completeShipmentWeightOz,

    // Hypothetical totals must NEVER be used for customer charges.
    hypotheticalParcels,
    hypotheticalParcelCount: hypotheticalParcels.length,
    hypotheticalTotalPackedWeightOz:
      hasUnresolvedItems ? null : hypotheticalTotalPackedWeightOz,

    specialtyResults,
    unresolvedItems,
    requiresManualReview:
      base.requiresManualReview || specialtyResults.length > 0,
    hypotheticalPackagingComplete: !hasUnresolvedItems,

    warning:
      "SIMULATION ONLY. Hypothetical packaging is unverified and requires physical validation before real carrier quotes."
  }
}
