import { isSupportedUspsFlatRateTemplate } from "./shippoParcelTemplatesV3.js"

const types = new Set([
  "mailer", "box", "fragile", "oversized", "custom"
])

const positive = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0

const nonnegative = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0

export function normalizeShippingPackage(record) {
  if (!record || typeof record !== "object" ||
      Array.isArray(record) || record.active !== true ||
      !types.has(record.type)) {
    return null
  }

  const length = record.lengthIn
  const width = record.widthIn
  const height = record.heightIn
  const tare = record.tareWeightOz ?? 0
  const maxWeight = record.maxWeightOz
  const clearance = record.clearanceIn ?? 0

  // STUDIO_058H15_FULFILLMENT_METADATA
  const uspsFlatRate = record.uspsFlatRate === true
  const carrier = typeof record.carrier === "string"
    ? record.carrier.trim()
    : ""
  const shippoParcelTemplate =
    typeof record.shippoParcelTemplate === "string"
      ? record.shippoParcelTemplate.trim()
      : ""

  // STUDIO_058H30_USPS_PACKAGE_IDENTITY
  // Only known USPS Flat Rate templates may use Flat Rate pricing.
  // A non-Flat-Rate parcel must not carry a carrier-specific
  // template into ordinary dimension-based shipping.
  if (
    (record.uspsFlatRate !== undefined &&
      typeof record.uspsFlatRate !== "boolean") ||
    (record.shippoParcelTemplate != null &&
      typeof record.shippoParcelTemplate !== "string") ||
    (uspsFlatRate &&
      (carrier !== "USPS" ||
        !isSupportedUspsFlatRateTemplate(shippoParcelTemplate))) ||
    (!uspsFlatRate && shippoParcelTemplate !== "")
  ) {
    return null
  }

  const verifiedShirtCapacity =
    record.verifiedShirtCapacity ?? null

  // A declared capacity must be a positive integer.
  // It does not establish the weight of the contents.
  if (
    verifiedShirtCapacity !== null &&
    (!Number.isSafeInteger(verifiedShirtCapacity) ||
      verifiedShirtCapacity < 1)
  ) {
    return null
  }

  // Reject invalid shipping configurations rather than
  // passing unsafe package measurements to a carrier.
  if (
    length > 120 ||
    width > 120 ||
    height > 120 ||
    maxWeight > 2400 ||
    tare > 2400
  ) {
    return null
  }

  if (![length, width, height, maxWeight].every(positive) ||
      !nonnegative(tare) ||
      !nonnegative(clearance) ||
      maxWeight <= tare ||
      clearance >= Math.min(length, width, height)) {
    return null
  }

  return {
    id: String(record._id ?? ""),
    name: String(record.name ?? ""),
    type: record.type,
    length,
    width,
    height,
    tare,
    maxWeight,
    clearance,
    uspsFlatRate,
    carrier,
    shippoParcelTemplate,
    verifiedShirtCapacity
  }
}

export function normalizeShippingPackageCatalog(records) {
  if (!Array.isArray(records)) {
    return []
  }

  return records
    .map(normalizeShippingPackage)
    .filter(Boolean)
}
