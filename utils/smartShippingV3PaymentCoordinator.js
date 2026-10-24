import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"
import {
  acquireV3CheckoutLock
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

// Only release a preparation that has not started a
// Square request. Database state is authoritative.
export const releaseV3UnstartedPreparation = async ({
  lock
}) => {
  if (!lock?.orderId || !lock?.owner) {
    return false
  }

  return runV3OwnedPaymentTransition({
    orderId: lock.orderId,
    owner: lock.owner,
    transition: async (session) => {
      const operation = await PaymentOperation.findOne({
        orderId: lock.orderId,
        environment: "sandbox",
        status: "pending",
        requestOwner: "",
        squarePaymentLinkId: "",
        squareOrderId: "",
        paymentUrl: ""
      }).session(session)

      if (!operation) {
        throw new Error(
          "V3 payment lock release requires unstarted operation."
        )
      }

      const result = await mongoose.connection
        .collection("smart_shipping_v3_checkout_locks")
        .deleteOne(
          {
            _id: new mongoose.Types.ObjectId(lock.orderId),
            owner: lock.owner
          },
          { session }
        )

      return result.deletedCount === 1
    }
  })
}