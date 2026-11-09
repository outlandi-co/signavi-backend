import {
  normalizeShippingPackageCatalog
} from "./normalizeShippingPackageCatalog.mjs"

export async function loadActiveShippingPackages(ShippingPackage) {
  if (!ShippingPackage ||
      typeof ShippingPackage.find !== "function") {
    throw new Error("SHIPPING_PACKAGE_MODEL_UNAVAILABLE")
  }

  // Read only. No writes, package creation, or implicit defaults.
  const records = await ShippingPackage
    .find({ active: true })
    .lean()

  if (!Array.isArray(records)) {
    throw new Error("SHIPPING_PACKAGE_CATALOG_UNAVAILABLE")
  }

  return normalizeShippingPackageCatalog(records)
}
