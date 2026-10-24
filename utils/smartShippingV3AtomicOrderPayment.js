import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"
import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js"
import {
  applyV3PreparedPayment,
  verifyV3AppliedPayment
} from "./smartShippingV3ApplyPayment.js"
import {
  verifyV3OrderPaymentBinding
} from "./smartShippingV3OrderPaymentBinding.js"

// Internal Sandbox-only persistence service.
//
// Must be called only after an authenticated checkout
// has acquired the matching V3 checkout lock.
//
// Guest ownership and signed-quote validity are
// rechecked against the fresh database order.
//
// Never call Square or another external service here.
// This function does not authorize payment creation.

export const persistV3AtomicOrderPayment = async ({
  lock,
  guestToken,
  signedQuote
}) => {
  if (
    !lock ||
    !mongoose.isValidObjectId(lock.orderId) ||
    typeof lock.owner !== "string" ||
    !lock.owner.trim() ||
    typeof guestToken !== "string" ||
    !guestToken.trim() ||
    typeof signedQuote !== "string" ||
    !signedQuote.trim()
  ) {
    throw new Error("Invalid V3 atomic checkout inputs.")
  }

  if (
    String(process.env.SQUARE_ENVIRONMENT || "")
      .trim()
      .toLowerCase() !== "sandbox"
  ) {
    throw new Error(
      "V3 atomic checkout requires Square Sandbox."
    )
  }

  const orderId = String(lock.orderId)

  return runV3OwnedPaymentTransition({
    orderId,
    owner: lock.owner,

    transition: async session => {
      // Re-read authoritative data inside the transaction.
      const order = await Order.findById(orderId)
        .session(session)

      const operation = await PaymentOperation.findOne({
        orderId: new mongoose.Types.ObjectId(orderId)
      }).session(session)

      if (!order || !operation) {
        throw new Error(
          "V3 order/payment transaction records missing."
        )
      }

      // Recheck guest ownership and quote validity
      // against the current saved order, not a stale copy.
      const prepared = prepareV3CheckoutPayment({
        order,
        guestToken,
        signedQuote
      })

      if (!prepared) {
        throw new Error(
          "V3 checkout authorization or quote invalid."
        )
      }

      // Existing Square ownership must never be
      // silently changed by this preparation.
      if (
        order.squareEnvironment &&
        order.squareEnvironment !== "sandbox"
      ) {
        throw new Error(
          "V3 order Square environment mismatch."
        )
      }

      if (
        order.squareExpectedAmountCents != null &&
        order.squareExpectedAmountCents !==
          prepared.totalCents
      ) {
        throw new Error(
          "V3 saved payment amount mismatch."
        )
      }

      const binding = verifyV3OrderPaymentBinding({
        order,
        prepared,
        operation
      })

      // Apply the signed, server-calculated shipping
      // amount and bind the saved order to Sandbox.
      applyV3PreparedPayment(order, prepared)

      order.squareEnvironment = "sandbox"
      order.squareExpectedAmountCents =
        prepared.totalCents

      if (!verifyV3AppliedPayment(order, prepared)) {
        throw new Error(
          "V3 prepared order verification failed."
        )
      }

      await order.save({ session })

      // Mongoose pre-save hooks may recalculate money.
      // Reject discrepancies before the transaction commits.
      if (
        !verifyV3AppliedPayment(order, prepared) ||
        order.squareExpectedAmountCents !==
          prepared.totalCents ||
        order.squareEnvironment !== "sandbox"
      ) {
        throw new Error(
          "V3 saved order payment amount mismatch."
        )
      }

      // Write to the payment operation within the
      // same transaction. Its amount, reference,
      // ownership, and pending state cannot drift.
      const operationUpdate =
        await PaymentOperation.updateOne(
          {
            _id: operation._id,
            orderId: order._id,
            amountCents: prepared.totalCents,
            checkoutReferenceId:
              binding.checkoutReferenceId,
            environment: "sandbox",
            status: "pending",
            requestOwner: "",
            squarePaymentLinkId: "",
            squareOrderId: "",
            paymentUrl: ""
          },
          {
            $currentDate: {
              updatedAt: true
            }
          },
          { session }
        )

      if (operationUpdate.matchedCount !== 1) {
        throw new Error(
          "V3 payment operation changed during preparation."
        )
      }

      // Re-read the stored order before the commit.
      const storedOrder = await Order.findById(orderId)
        .session(session)

      if (
        !storedOrder ||
        !verifyV3AppliedPayment(storedOrder, prepared) ||
        storedOrder.squareEnvironment !== "sandbox" ||
        storedOrder.squareExpectedAmountCents !==
          prepared.totalCents
      ) {
        throw new Error(
          "V3 transactional order verification failed."
        )
      }

      return Object.freeze({
        orderId,
        checkoutReferenceId:
          binding.checkoutReferenceId,
        amountCents: prepared.totalCents,
        shippingAmountCents:
          prepared.shippingAmountCents,
        orderPaymentBound: true,
        environment: "sandbox",
        squareRequestAuthorized: false
      })
    }
  })
}