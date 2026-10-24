import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"

const validatePayment = ({
  orderId,
  owner,
  amountCents,
  idempotencyKey
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    typeof idempotencyKey !== "string" ||
    !idempotencyKey.trim()
  ) {
    throw new Error("Invalid V3 payment transition.")
  }
}

export const markV3PaymentRequestStarted = async ({
  orderId,
  owner,
  amountCents,
  idempotencyKey
}) => {
  validatePayment({
    orderId,
    owner,
    amountCents,
    idempotencyKey
  })

  return runV3OwnedPaymentTransition({
    orderId,
    owner,
    transition: async (session) => {
      return PaymentOperation.findOneAndUpdate(
        {
          orderId,
          amountCents,
          idempotencyKey,
          environment: "sandbox",
          status: "pending"
        },
        {
          $set: {
            status: "reconciliation_required",
            requestOwner: owner,
            lastError: "Square request outcome not yet confirmed."
          }
        },
        {
          session,
          returnDocument: "after"
        }
      )
    }
  })
}

export const markV3PaymentCompleted = async ({
  orderId,
  owner,
  amountCents,
  idempotencyKey,
  paymentUrl,
  squarePaymentLinkId,
  squareOrderId
}) => {
  validatePayment({
    orderId,
    owner,
    amountCents,
    idempotencyKey
  })

  if (
    typeof paymentUrl !== "string" ||
    !paymentUrl.startsWith("https://") ||
    typeof squarePaymentLinkId !== "string" ||
    !squarePaymentLinkId.trim() ||
    typeof squareOrderId !== "string" ||
    !squareOrderId.trim()
  ) {
    throw new Error("Incomplete Square payment-link response.")
  }

  return runV3OwnedPaymentTransition({
    orderId,
    owner,
    transition: async (session) => {
      return PaymentOperation.findOneAndUpdate(
        {
          orderId,
          amountCents,
          idempotencyKey,
          environment: "sandbox",
          status: "reconciliation_required",
          requestOwner: owner,
          squareCreationAttemptClaimedAt: { $type: "date" },
          squarePaymentLinkId: "",
          squareOrderId: ""
        },
        {
          $set: {
            status: "completed",
            paymentUrl,
            squarePaymentLinkId,
            squareOrderId,
            lastError: ""
          }
        },
        {
          session,
          returnDocument: "after"
        }
      )
    }
  })
}