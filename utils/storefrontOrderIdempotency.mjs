import { createHash } from "node:crypto"

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const parseStorefrontAttemptKey = (value) => {
  if (typeof value !== "string" || !UUID_V4.test(value)) {
    return null
  }

  return value.toLowerCase()
}

const canonical = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonical)
  }

  if (value && typeof value === "object") {
    const output = {}

    for (const key of Object.keys(value).sort()) {
      const child = value[key]

      if (
        child === undefined ||
        typeof child === "function" ||
        typeof child === "symbol"
      ) {
        throw new Error("Unsupported request value.")
      }

      output[key] = canonical(child)
    }

    return output
  }

  if (
    value !== null &&
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new Error("Unsupported request value.")
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Invalid numeric request value.")
  }

  return value
}

export const fingerprintStorefrontOrder = (input) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    throw new Error("Invalid storefront order request.")
  }

  const normalized = {
    version: "storefront-order-idempotency-v1",
    email: String(input.email || "").trim().toLowerCase(),
    customerName: String(input.customerName || "Customer").trim(),
    phone: String(input.phone || ""),
    address: canonical(input.address ?? null),
    items: canonical(input.items)
  }

  if (
    !normalized.email ||
    !Array.isArray(normalized.items) ||
    normalized.items.length < 1 ||
    normalized.items.length > 100
  ) {
    throw new Error("Incomplete storefront order request.")
  }

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
}

export const classifyStorefrontAttempt = ({
  existingFingerprint,
  requestedFingerprint
}) => {
  if (
    typeof requestedFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/i.test(requestedFingerprint)
  ) {
    return "invalid"
  }

  if (existingFingerprint == null) {
    return "new"
  }

  if (
    typeof existingFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/i.test(existingFingerprint)
  ) {
    return "conflict"
  }

  return existingFingerprint === requestedFingerprint
    ? "same-attempt"
    : "conflict"
}