const ALLOWED_STOREFRONTS = new Set([
  "signavi_store",
  "signavi_studio"
])

function parseStorefront(value, defaultValue = null) {
  if (value === undefined || value === null) {
    if (defaultValue !== null) return defaultValue
    throw new Error("Storefront channel is required.")
  }

  if (typeof value !== "string") {
    throw new Error("Invalid storefront channel.")
  }

  const channel = value.trim().toLowerCase()

  if (!ALLOWED_STOREFRONTS.has(channel)) {
    throw new Error("Invalid storefront channel.")
  }

  return channel
}

export function resolveCheckoutStorefront(request = {}) {
  if (
    !request ||
    typeof request !== "object" ||
    Array.isArray(request)
  ) {
    throw new Error("Invalid checkout request.")
  }

  const storefront = parseStorefront(
    request.storefront,
    "signavi_store"
  )

  if (request.items !== undefined) {
    if (!Array.isArray(request.items)) {
      throw new Error("Invalid checkout items.")
    }

    for (const item of request.items) {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item)
      ) {
        throw new Error("Invalid checkout item.")
      }

      if (
        item.storefront !== undefined &&
        item.storefront !== null
      ) {
        const itemStorefront = parseStorefront(item.storefront)

        if (itemStorefront !== storefront) {
          throw new Error(
            "Products from different storefronts cannot share one checkout."
          )
        }
      }
    }
  }

  return storefront
}