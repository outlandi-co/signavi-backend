import mongoose from "mongoose"
import {
  acquireV3CheckoutLock,
  releaseV3CheckoutLock
} from "./smartShippingV3CheckoutLock.js"
import {
  prepareV3PaymentOperation
} from "./smartShippingV3PaymentOperation.js"

export const coordinateV3PaymentPreparation = async ({
  orderId,
  amountCents
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new Error("Invalid V3 payment preparation.")
  }

  const lock = await acquireV3CheckoutLock(orderId)

  if (!lock) {
    return {
      success: false,
      reason: "checkout_in_progress"
    }
  }

  try {
    const operation = await prepareV3PaymentOperation({
      orderId,
      amountCents
    })

    // Keep the lock until the payment outcome is known.
    // The caller must not release it merely because
    // preparation succeeded.
    return {
      success: true,
      lock,
      operation
    }
  } catch (error) {
    // A payment operation may already exist, and errors
    // do not prove that Square has not been contacted.
    // Leave the lock in place for explicit reconciliation.
    throw error
  }
}

// For test-only cleanup before any Square request.
// Do not use as general payment recovery.
export const releaseV3UnstartedPreparation = async ({
  lock,
  squareRequestStarted = true
}) => {
  if (squareRequestStarted) {
    throw new Error(
      "Cannot release a payment lock after Square may have been contacted."
    )
  }

  return releaseV3CheckoutLock(lock)
}