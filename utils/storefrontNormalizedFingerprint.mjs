import {
  fingerprintStorefrontOrder
} from "./storefrontOrderIdempotency.mjs"

const clean = value => String(value || "").trim()

const ORDER_ID = /^[a-f0-9]{24}$/i

// This helper accepts VALIDATED catalog items, not raw browser items.
// Use only immutable purchase-selection fields for replay identity.
// Server pricing and stock must still be verified on first creation.
export const projectNormalizedStorefrontOrder = (
  request,
  catalogItems
) => {
  if (
    !request ||
    typeof request !== "object" ||
    !Array.isArray(catalogItems) ||
    catalogItems.length < 1 ||
    catalogItems.length > 100
  ) {
    throw new Error("Invalid normalized storefront order.")
  }

  const address = request.address || {}

  const items = catalogItems.map(item => {
    const productId = clean(item?.productId).toLowerCase()
    const quantity = Number(item?.quantity)

    if (
      !ORDER_ID.test(productId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 500
    ) {
      throw new Error("Invalid validated catalog item.")
    }

    const selected = item.selectedVariant

    return {
      productId,
      quantity,
      selectedVariant: selected
        ? {
            color: clean(selected.color).toLowerCase(),
            size: clean(selected.size).toLowerCase()
          }
        : null
    }
  })

  return {
    email: clean(request.email).toLowerCase(),
    customerName: clean(request.customerName || "Customer"),
    phone: clean(request.phone),
    address: {
      street: clean(address.street),
      city: clean(address.city),
      state: clean(address.state),
      zip: clean(address.zip),
      country: clean(address.country || "US")
    },
    items
  }
}

export const fingerprintNormalizedStorefrontOrder = (
  request,
  catalogItems
) => fingerprintStorefrontOrder(
  projectNormalizedStorefrontOrder(request, catalogItems)
)