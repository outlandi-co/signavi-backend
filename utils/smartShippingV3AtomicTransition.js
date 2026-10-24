import mongoose from "mongoose"

export const runV3OwnedPaymentTransition = async ({
  orderId,
  owner,
  transition
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    typeof transition !== "function"
  ) {
    throw new Error("Invalid V3 owned payment transition.")
  }

  const session = await mongoose.startSession()

  try {
    let result

    await session.withTransaction(async () => {
      const locks = mongoose.connection.collection(
        "smart_shipping_v3_checkout_locks"
      )

      // Write to the lock in the same transaction as the
      // payment operation. Concurrent lock replacement
      // must conflict rather than silently succeed.
      const lockResult = await locks.updateOne(
        {
          _id: new mongoose.Types.ObjectId(orderId),
          owner
        },
        {
          $inc: { ownershipChecks: 1 }
        },
        { session }
      )

      if (lockResult.matchedCount !== 1) {
        throw new Error(
          "V3 checkout lock ownership required."
        )
      }

      // This callback may perform MongoDB operations only.
      // It must never contact Square or another external API.
      result = await transition(session)

      if (!result) {
        throw new Error(
          "V3 payment transition rejected."
        )
      }
    })

    return result
  } finally {
    await session.endSession()
  }
}