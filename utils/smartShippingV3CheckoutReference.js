import mongoose from "mongoose"

// Canonical identity for a persisted V3 Sandbox order.
//
// This is a public correlation identifier, not
// evidence of checkout authorization.
//
// Never use it alone to authorize a payment request,
// reconciliation, retry, or lock release.

export const createV3CheckoutReference = ({ orderId }) => {
  const id =
    orderId instanceof mongoose.Types.ObjectId
      ? orderId.toHexString()
      : orderId

  if (
    typeof id !== "string" ||
    !/^[a-fA-F0-9]{24}$/.test(id) ||
    !mongoose.isValidObjectId(id)
  ) {
    throw new Error("Invalid V3 checkout reference order ID.")
  }

  return `signavi-v3-sandbox-${id.toLowerCase()}`
}

export const verifyV3CheckoutReference = ({
  orderId,
  referenceId
}) => {
  if (
    typeof referenceId !== "string" ||
    !referenceId.trim()
  ) {
    return false
  }

  return referenceId === createV3CheckoutReference({
    orderId
  })
}