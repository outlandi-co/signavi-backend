import {
  fingerprintStorefrontOrder
} from "./storefrontOrderIdempotency.mjs"

import { resolveCheckoutStorefront } from "./resolveCheckoutStorefront.js"

const PRODUCT_ID = /^[a-f0-9]{24}$/i

const clean = value => String(value ?? "").trim()

const field = value => {
  if (
    value !== undefined &&
    value !== null &&
    typeof value !== "string"
  ) {
    throw new Error("Invalid customer field.")
  }

  return clean(value)
}

export function projectPreCatalogStorefrontOrder(request) {
  if (
    !request ||
    typeof request !== "object" ||
    Array.isArray(request) ||
    !Array.isArray(request.items) ||
    request.items.length < 1 ||
    request.items.length > 100
  ) {
    throw new Error("Invalid storefront purchase selection.")
  }

  const email = field(request.email).toLowerCase()

  if (!email) {
    throw new Error("Customer email is required.")
  }

  const address = request.address ?? {}

  if (
    !address ||
    typeof address !== "object" ||
    Array.isArray(address)
  ) {
    throw new Error("Invalid shipping address.")
  }

  const storefront = resolveCheckoutStorefront(request)

  const items = request.items.map(item => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      throw new Error("Invalid purchase item.")
    }

    const productId = clean(
      item.productId ??
      item._id ??
      item.id ??
      item.product?._id
    ).toLowerCase()

    const quantity = Number(item.quantity ?? 1)

    if (
      !PRODUCT_ID.test(productId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 500
    ) {
      throw new Error("Invalid purchase item identity.")
    }

    const selected = item.selectedVariant ?? item.variant ?? null

    if (
      selected !== null &&
      (
        typeof selected !== "object" ||
        Array.isArray(selected)
      )
    ) {
      throw new Error("Invalid selected variant.")
    }

    let selectedVariant = null

    if (selected !== null) {
      const color = field(selected.color).toLowerCase()
      const size = field(selected.size).toLowerCase()

      if (!color || !size) {
        throw new Error("Incomplete selected variant.")
      }

      selectedVariant = { color, size }
    }

    const identity = {
      productId,
      quantity,
      selectedVariant
    }

    // Preserve the exact legacy Store fingerprint.
    // Studio gets a channel-specific, design-aware identity.
    if (storefront === "signavi_studio") {
      return {
        ...identity,
        storefront,
        customization: item.customization ?? null
      }
    }

    return identity
  })

  return {
    email,
    customerName: field(request.customerName || "Customer"),
    phone: field(request.phone),
    address: {
      street: field(address.street),
      city: field(address.city),
      state: field(address.state),
      zip: field(address.zip),
      country: field(address.country || "US")
    },
    items
  }
}

export function fingerprintPreCatalogStorefrontOrder(request) {
  return fingerprintStorefrontOrder(
    projectPreCatalogStorefrontOrder(request)
  )
}