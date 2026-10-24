import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

// Read-only detection guard.
// Does not acquire a reservation or make legacy creation atomic.
// Intended for integration only after concurrency review.
export const checkV3LegacyPaymentConflict = async ({
  orderId
}) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("Invalid order ID for V3 conflict check.")
  }

  if (mongoose.connection.readyState !== 1) {
    throw new Error("V3 conflict check requires a connected database.")
  }

  const id = new mongoose.Types.ObjectId(String(orderId))

  const [operation, lock] = await Promise.all([
    PaymentOperation.exists({ orderId: id }),
    mongoose.connection
      .collection("smart_shipping_v3_checkout_locks")
      .findOne({ _id: id }, { projection: { _id: 1 } })
  ])

  return Object.freeze({
    orderId: String(id),
    blocked: Boolean(operation || lock),
    squareRequestAuthorized: false,
    lockReleaseAuthorized: false
  })
}