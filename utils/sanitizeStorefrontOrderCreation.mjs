const OBJECT_ID = /^[a-f0-9]{24}$/i

/**
 * Guest-facing order creation data.
 *
 * Never spread, serialize, or return the raw Order document.
 * Only the order identifier is required for frontend checkout
 * navigation; the guest token stays in the enclosing response.
 */
export function sanitizeStorefrontOrderCreation(order) {
  const id = String(order?._id ?? "")

  if (!OBJECT_ID.test(id)) {
    throw new Error("Invalid storefront order identifier.")
  }

  return Object.freeze({
    _id: id.toLowerCase()
  })
}