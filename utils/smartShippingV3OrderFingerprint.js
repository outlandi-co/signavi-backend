import crypto from "node:crypto"
import { createV3CartFingerprint } from "./smartShippingV3CartFingerprint.js"

export const createV3OrderFingerprint = (order) => {
  if (!order || !order._id) {
    throw new Error("A saved order is required.")
  }

  if (
    !Array.isArray(order.items) ||
    order.items.length === 0
  ) {
    throw new Error("Saved order has no items.")
  }

  const address = order.address

  if (!address) {
    throw new Error("Saved order has no shipping address.")
  }

  const cartFingerprint = createV3CartFingerprint({
    items: order.items,
    address: {
      name: order.customerName || "",
      street1: address.street,
      street2: "",
      city: address.city,
      state: address.state,
      zip: address.zip,
      country: address.country
    }
  })

  const orderId = String(order._id).trim().toLowerCase()

  if (!/^[a-f0-9]{24}$/.test(orderId)) {
    throw new Error("Invalid saved order ID.")
  }

  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      version: 3,
      orderId,
      cartFingerprint
    }))
    .digest("hex")
}