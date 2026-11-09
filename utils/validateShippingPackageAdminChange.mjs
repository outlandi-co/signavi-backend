import {
  normalizeShippingPackage
} from "./normalizeShippingPackageCatalog.mjs"

const defaults = {
  carrier: "Generic",
  tareWeightOz: 0,
  clearanceIn: 0,
  uspsFlatRate: false,
  shippoParcelTemplate: "",
  verifiedShirtCapacity: null,
  active: true
}

export function validateShippingPackageAdminChange({
  existing = null,
  changes
} = {}) {
  if (
    !changes ||
    typeof changes !== "object" ||
    Array.isArray(changes) ||
    (existing !== null &&
      (typeof existing !== "object" || Array.isArray(existing)))
  ) {
    return false
  }

  const candidate = {
    ...defaults,
    ...(existing || {}),
    ...changes
  }

  // Inactive packages are drafts. They are not eligible
  // for checkout until a valid activation occurs.
  if (candidate.active === false) {
    return true
  }

  if (candidate.active !== true) {
    return false
  }

  // Use exactly the same eligibility rules as checkout.
  return normalizeShippingPackage(candidate) !== null
}