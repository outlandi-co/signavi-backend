import crypto from "node:crypto"

const string = (value) =>
  String(value ?? "").trim()

const moneyCents = (value) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error("Invalid trusted cart price.")
  }

  const cents = Math.round(value * 100)

  if (!Number.isSafeInteger(cents)) {
    throw new Error("Invalid cart price precision.")
  }

  return cents
}

export const createV3CartFingerprint = ({
  items,
  address
}) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Trusted cart items are required.")
  }

  if (!address || typeof address !== "object") {
    throw new Error("Trusted shipping address is required.")
  }

  const normalizedItems = items.map((item) => {
    const productId = string(item.productId)
    const quantity = Number(item.quantity)

    if (
      !/^[a-f0-9]{24}$/i.test(productId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      throw new Error("Invalid trusted cart item.")
    }

    return {
      productId: productId.toLowerCase(),
      quantity,
      color: string(
        item.variant?.color ||
        item.selectedVariant?.color
      ).toLowerCase(),
      size: string(
        item.variant?.size ||
        item.selectedVariant?.size
      ).toUpperCase(),
      priceCents: moneyCents(item.finalPrice)
    }
  })

  normalizedItems.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  )

  const normalizedAddress = {
    name: string(address.name).toLowerCase(),
    street1: string(address.street1).toLowerCase(),
    street2: string(address.street2).toLowerCase(),
    city: string(address.city).toLowerCase(),
    state: string(address.state).toUpperCase(),
    zip: string(address.zip).toUpperCase(),
    country: string(address.country).toUpperCase()
  }

  if (
    !normalizedAddress.street1 ||
    !normalizedAddress.city ||
    !normalizedAddress.state ||
    !normalizedAddress.zip ||
    !normalizedAddress.country
  ) {
    throw new Error("Incomplete trusted shipping address.")
  }

  const payload = {
    version: 3,
    items: normalizedItems,
    address: normalizedAddress
  }

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
}