import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  assessV3RecoveredLinkEligibility
} from "./smartShippingV3RecoveredLinkEligibility.js"

// TEST-ONLY recovery primitive.
// Not a public route and not authorization to modify real orders.
// Caller must independently verify Square and supply trusted evidence.
// No Square network calls are made by this module.

export const recordV3RecoveredLinkTransaction = async ({
  orderId,
  owner,
  expectedPaymentLinkId,
  verified
}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_RECOVERY_TEST_WRITES !== "true" ||
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !== "signavi_shipping_v3_recovery_tests"
  ) {
    throw new Error("V3 recovery transaction is test-only.")
  }

  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    typeof expectedPaymentLinkId !== "string" ||
    !expectedPaymentLinkId.trim()
  ) {
    throw new Error("Invalid V3 recovery transaction inputs.")
  }

  if (String(orderId) === "6addc6f674d8362634569095") {
    throw new Error("Protected original order cannot be used in tests.")
  }

  const id = new mongoose.Types.ObjectId(String(orderId))
  const session = await mongoose.startSession()

  try {
    let result

    await session.withTransaction(async () => {
      const locks = mongoose.connection.collection(
        "smart_shipping_v3_checkout_locks"
      )

      const order = await Order.findById(id)
        .session(session).lean()

      const operation = await PaymentOperation.findOne({
        orderId: id,
        environment: "sandbox"
      }).session(session).lean()

      const lock = await locks.findOne(
        { _id: id, owner },
        { session }
      )

      if (
        !lock ||
        !(lock.expiresAt instanceof Date) ||
        lock.expiresAt > new Date() ||
        operation?.requestOwner !== owner
      ) {
        throw new Error("Recovery ownership or expiry mismatch.")
      }

      const eligibility = assessV3RecoveredLinkEligibility({
        order,
        operation,
        verified,
        expectedPaymentLinkId
      })

      if (!eligibility.eligible) {
        throw new Error("Recovered link eligibility rejected.")
      }

      const fenced = await locks.updateOne(
        {
          _id: id,
          owner,
          expiresAt: { $lte: new Date() }
        },
        { $inc: { ownershipChecks: 1 } },
        { session }
      )

      if (fenced.matchedCount !== 1) {
        throw new Error("Recovery ownership fence rejected.")
      }

      // Atomic write fence: competing writes to this order
      // conflict with this transaction rather than merely
      // passing a snapshot read.
      const orderFence = await Order.collection.updateOne(
        {
          _id: id,
          squareEnvironment: "sandbox",
          currency: "USD",
          squareExpectedAmountCents: operation.amountCents,
          paymentStatus: { $ne: "paid" },
          status: { $in: ["payment_required", "pending"] },
          squarePaymentLinkId: order.squarePaymentLinkId ?? "",
          squareOrderId: order.squareOrderId ?? ""
        },
        {
          $inc: { v3RecoveryVerificationChecks: 1 }
        },
        { session }
      )

      if (orderFence.matchedCount !== 1) {
        throw new Error("Order payment state changed.")
      }

      // Test-only fault injection. The outer test/database gates
      // must have passed before execution reaches this point.
      if (
        process.env.SMART_SHIPPING_V3_TEST_INJECT_FAILURE ===
        "after_order_fence"
      ) {
        throw new Error("V3 injected rollback after fences.")
      }
      const updated = await PaymentOperation.findOneAndUpdate(
        {
          orderId: id,
          environment: "sandbox",
          status: "reconciliation_required",
          amountCents: operation.amountCents,
          idempotencyKey: operation.idempotencyKey,
          checkoutReferenceId: operation.checkoutReferenceId,
          requestOwner: owner,
          squareCreationAttemptClaimedAt:
            operation.squareCreationAttemptClaimedAt,
          squarePaymentLinkId: "",
          squareOrderId: "",
          paymentUrl: ""
        },
        {
          $set: {
            status: "completed",
            squarePaymentLinkId: verified.squarePaymentLinkId,
            squareOrderId: verified.squareOrderId,
            paymentUrl: verified.paymentUrl,
            lastError: ""
          }
        },
        {
          session,
          returnDocument: "after",
          runValidators: true
        }
      )

      if (!updated) {
        throw new Error("Recovered link operation changed.")
      }

      result = Object.freeze({
        recorded: true,
        paymentLinkRecorded: true,
        customerPaymentConfirmed: false,
        squareCreationAuthorized: false,
        claimResetAuthorized: false
      })
    })

    return result
  } finally {
    await session.endSession()
  }
}