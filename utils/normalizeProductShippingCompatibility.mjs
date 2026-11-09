export const SHIPPING_COMPATIBILITY_MODES = Object.freeze([
  "combine",
  "protected",
  "separate"
]);

const validModes = new Set(SHIPPING_COMPATIBILITY_MODES);

function optionalBoolean(value, field, fallback = false) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new TypeError(field + " must be a boolean.");
  }

  return value;
}

// Pure validation utility. No database, carrier, or checkout calls.
export function normalizeProductShippingCompatibility(
  input = {}
) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new TypeError("Shipping compatibility must be an object.");
  }

  const legacySeparate = optionalBoolean(
    input.shipSeparately,
    "shipSeparately"
  );

  const mode = input.compatibilityMode === undefined ||
    input.compatibilityMode === null
      ? (legacySeparate ? "separate" : "combine")
      : input.compatibilityMode;

  if (!validModes.has(mode)) {
    throw new TypeError("Invalid shipping compatibility mode.");
  }

  if (legacySeparate && mode !== "separate") {
    throw new TypeError(
      "Existing separate-shipping rule conflicts with compatibility mode."
    );
  }

  let maxUnitsPerPackage = null;

  if (
    input.maxUnitsPerPackage !== undefined &&
    input.maxUnitsPerPackage !== null
  ) {
    if (
      !Number.isSafeInteger(input.maxUnitsPerPackage) ||
      input.maxUnitsPerPackage < 1
    ) {
      throw new TypeError(
        "maxUnitsPerPackage must be a positive integer."
      );
    }

    maxUnitsPerPackage = input.maxUnitsPerPackage;
  }

  const requiresProtection = optionalBoolean(
    input.requiresProtection,
    "requiresProtection",
    mode === "protected"
  );

  const oversized = optionalBoolean(
    input.oversized,
    "oversized"
  );

  if (mode === "protected" && !requiresProtection) {
    throw new TypeError(
      "Protected shipping mode requires protective packaging."
    );
  }

  return {
    compatibilityMode: mode,
    shipSeparately: mode === "separate",
    requiresProtection,
    oversized,
    maxUnitsPerPackage
  };
}