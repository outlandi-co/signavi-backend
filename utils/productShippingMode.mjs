export const SHIPPING_MODES = Object.freeze({
  SAVED: "saved_package",
  PRODUCT: "product_measurements",
  ORDER: "per_order"
})

const allowedModes = new Set(Object.values(SHIPPING_MODES))
const packageIdPattern = /^[a-f\d]{24}$/i

export function resolveShippingMode(value) {
  if (value === undefined || value === null || value === "") {
    return SHIPPING_MODES.PRODUCT
  }

  return allowedModes.has(value) ? value : null
}

export function validateShippingSelection(shipping) {
  if (!shipping || typeof shipping !== "object" || Array.isArray(shipping)) {
    return { valid: false, error: "Shipping must be an object." }
  }

  const mode = resolveShippingMode(shipping.mode)

  if (!mode) {
    return { valid: false, error: "Invalid shipping mode." }
  }

  const selectedId = shipping.packageId
  const hasId = selectedId !== undefined &&
    selectedId !== null &&
    selectedId !== ""

  if (mode === SHIPPING_MODES.SAVED) {
    if (typeof selectedId !== "string" ||
        !packageIdPattern.test(selectedId)) {
      return {
        valid: false,
        error: "Select a valid saved shipping package."
      }
    }
  } else if (hasId) {
    return {
      valid: false,
      error: "Package ID is only permitted for saved packages."
    }
  }

  if (mode === SHIPPING_MODES.PRODUCT) {
    for (const field of [
      "weightOz",
      "lengthIn",
      "widthIn",
      "heightIn"
    ]) {
      const raw = shipping[field]

      if (raw === null ||
          raw === undefined ||
          typeof raw === "boolean" ||
          typeof raw === "object" ||
          String(raw).trim() === "" ||
          !Number.isFinite(Number(raw)) ||
          Number(raw) <= 0) {
        return {
          valid: false,
          error: `${field} must be a positive number.`
        }
      }
    }
  }

  return {
    valid: true,
    mode,
    packageId: mode === SHIPPING_MODES.SAVED
      ? selectedId
      : null
  }
}