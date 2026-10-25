import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
} from "./smartShippingV3CheckoutReference.js"

// Read-only identity classification.
//
// An exact matching reference proves only correlation
// with the supplied order ID. It never authorizes payment
// creation, Square lookup, retries or lock release.
export const classifyV3CheckoutReference = ({
  orderId,
  referenceId
}) => {
  if (typeof referenceId !== "string") {
    return null
  }

  let legacy
  let squareSafe

  try {
    legacy = createV3CheckoutReference({ orderId })
    squareSafe = createV3SquareSafeCheckoutReference({ orderId })
  } catch {
    return null
  }

  if (referenceId === legacy) {
    return "legacy"
  }

  if (referenceId === squareSafe && referenceId.length <= 40) {
    return "square_safe"
  }

  return null
}

// Fail closed at the Square request boundary.
// The legacy identity remains valid for inspecting
// historical records but MUST NOT be sent as a new
// Square order.reference_id.
export const assertV3SquareSafeReference = ({
  orderId,
  referenceId
}) => {
  if (
    classifyV3CheckoutReference({
      orderId,
      referenceId
    }) !== "square_safe"
  ) {
    throw new Error("Square-safe V3 checkout reference required.")
  }

  return referenceId
}
