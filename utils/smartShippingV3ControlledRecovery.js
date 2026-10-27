import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"

// Internal development-only recovery.
//
// Requires the original lock owner.
// Rechecks expiration and payment state in one
// MongoDB transaction.
//
// Never calls Square, creates a payment, or
// changes an existing payment operation.

export const recoverV3ExpiredUnstartedCheckout = async ({
  orderId,
  owner,
  now = new Date()
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error("Invalid V3 controlled recovery inputs.")
  }

  if (
    !["development", "test"].includes(
      String(process.env.NODE_ENV || "").toLowerCase()
    ) ||
    String(process.env.SQUARE_ENVIRONMENT || "")
      .toLowerCase() !== "sandbox" ||
    String(process.env.SMART_SHIPPING_V3_ENABLED || "")
      .toLowerCase() !== "true"
  ) {
    throw new Error(
      "V3 controlled recovery requires development Sandbox."
    )
  }

  const id = new mongoose.Types.ObjectId(String(orderId))

  return runV3OwnedPaymentTransition({
    orderId: String(id),
    owner,
    lockMustBeExpired: true,

    transition: async session => {
      const locks = mongoose.connection.collection(
        "smart_shipping_v3_checkout_locks"
      )

      const lock = await locks.findOne(
        {
          _id: id,
          owner
        },
        { session }
      )

      if (
        !lock ||
        !(lock.expiresAt instanceof Date) ||
        !Number.isFinite(lock.expiresAt.getTime()) ||
        lock.expiresAt > now
      ) {
        throw new Error(
          "V3 recovery requires an expired owned lock."
        )
      }

      const operation = await PaymentOperation.findOne({
        orderId: id,
        environment: "sandbox",
        status: "pending",
        requestOwner: "",
        squarePaymentLinkId: "",
        squareOrderId: "",
        paymentUrl: ""
      }).session(session)

      if (!operation) {
        throw new Error(
          "V3 recovery requires an unstarted payment operation."
        )
      }

      // The ownership-fencing write in
      // runV3OwnedPaymentTransition protects against
      // concurrent payment-start and release changes.
      const deleted = await locks.deleteOne(
        {
          _id: id,
          owner,
          expiresAt: { $lte: now }
        },
        { session }
      )

      if (deleted.deletedCount !== 1) {
        throw new Error(
          "V3 recovery lock changed during transaction."
        )
      }

      return Object.freeze({
        orderId: String(id),
        recovered: true,
        paymentOperationPreserved: true,
        squareRequestAuthorized: false
      })
    }
  })
}