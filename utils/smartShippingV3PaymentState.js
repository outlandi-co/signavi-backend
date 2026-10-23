import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const getLock = async (orderId, owner) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner
  ) {
    return false
  }

  const lock = await mongoose.connection
    .collection("smart_shipping_v3_checkout_locks")
    .findOne({
      _id: new mongoose.Types.ObjectId(orderId),
      owner
    })

  return Boolean(lock)
}

export const markV3PaymentRequestStarted = async ({
  orderId,
  owner,
  amountCents,
  idempotencyKey
}) => {
  if (!(await getLock(orderId, owner))) {
    throw new Error("V3 checkout lock ownership required.")
  }

  const operation = await PaymentOperation.findOneAndUpdate(
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
        lastError: "Square request outcome not yet confirmed."
      }
    },
    { returnDocument: "after" }
  )

  if (!operation) {
    throw new Error("V3 payment transition rejected.")
  }

  return operation
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
  if (!(await getLock(orderId, owner))) {
    throw new Error("V3 checkout lock ownership required.")
  }

  if (
    !String(paymentUrl || "").startsWith("https://") ||
    !squarePaymentLinkId ||
    !squareOrderId
  ) {
    throw new Error("Incomplete Square payment-link response.")
  }

  const operation = await PaymentOperation.findOneAndUpdate(
    {
      orderId,
      amountCents,
      idempotencyKey,
      environment: "sandbox",
      status: "reconciliation_required",
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
    { returnDocument: "after" }
  )

  if (!operation) {
    throw new Error("V3 completed payment transition rejected.")
  }

  return operation
}