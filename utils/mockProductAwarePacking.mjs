import { simulateShirtPackaging } from "./mockStorefrontPackaging.mjs"

// SIGNAVI.SHIPPING.022
// Explicit classifications only. Never infer from product names.
// Inputs are intended to be trusted backend product records.
// This adapter must never feed production carrier or checkout paths.

export function simulateProductAwarePacking(product, quantity) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SIGNAVI_MOCK_SHIPPING !== "enabled"
  ) {
    throw new Error("MOCK_PACKAGING_SANDBOX_ONLY")
  }

  if (!product || typeof product !== "object" || Array.isArray(product)) {
    throw new Error("INVALID_PRODUCT")
  }

  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 200) {
    throw new Error("INVALID_QUANTITY")
  }

  if (product.productType !== "physical") {
    throw new Error("PHYSICAL_PRODUCT_REQUIRED")
  }

  const shipping = product.shipping || {}
  const shippingClass = product.shippingClass
  const mode = shipping.compatibilityMode ||
    (shipping.shipSeparately === true ? "separate" : "combine")

  if (
    !["combine", "protected", "separate"].includes(mode) ||
    (shipping.shipSeparately === true && mode !== "separate")
  ) {
    throw new Error("INVALID_SHIPPING_COMPATIBILITY")
  }

  if (
    shipping.maxUnitsPerPackage != null &&
    (!Number.isSafeInteger(shipping.maxUnitsPerPackage) ||
      shipping.maxUnitsPerPackage < 1)
  ) {
    throw new Error("INVALID_PACKAGE_CAPACITY")
  }

  // The first mock engine is only verified as a simulator for
  // T-shirt-specific quantities. Other classes fail closed.
  if (shippingClass !== "tshirt") {
    return {
      mode: "sandbox-mock",
      shippingClass: shippingClass || "unclassified",
      checkoutEligible: false,
      productionRatesAllowed: false,
      requiresManualReview: true,
      reason: "MOCK_PACKING_CLASS_NOT_IMPLEMENTED",
      parcels: []
    }
  }

  if (
    mode !== "combine" ||
    shipping.requiresProtection === true ||
    shipping.oversized === true
  ) {
    return {
      mode: "sandbox-mock",
      shippingClass,
      checkoutEligible: false,
      productionRatesAllowed: false,
      requiresManualReview: true,
      reason: "SPECIAL_PACKING_RULE_NOT_IMPLEMENTED",
      parcels: []
    }
  }

  const capacity = shipping.maxUnitsPerPackage

  // A verified product-level limit may be smaller than the
  // simulator's default. Do not silently exceed it.
  if (capacity != null && capacity < Math.min(quantity, 3)) {
    return {
      mode: "sandbox-mock",
      shippingClass,
      checkoutEligible: false,
      productionRatesAllowed: false,
      requiresManualReview: true,
      reason: "PRODUCT_CAPACITY_RULE_NOT_IMPLEMENTED",
      parcels: []
    }
  }

  const result = simulateShirtPackaging({
    quantity,
    unitWeightOz: shipping.weightOz
  })

  // SIGNAVI_SHIPPING_023_CAPACITY
  // The simulator may select a larger box than the product's
  // explicitly configured per-package limit.
  if (
    capacity != null &&
    result.parcels.some(parcel => parcel.quantity > capacity)
  ) {
    return {
      mode: "sandbox-mock",
      shippingClass,
      checkoutEligible: false,
      productionRatesAllowed: false,
      requiresManualReview: true,
      reason: "PRODUCT_CAPACITY_RULE_NOT_IMPLEMENTED",
      parcels: []
    }
  }

  return {
    ...result,
    shippingClass,
    requiresManualReview: false,
    source: "trusted-product-shipping",
    checkoutEligible: false,
    productionRatesAllowed: false
  }
}
