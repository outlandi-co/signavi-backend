import crypto from "node:crypto"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  createV3CheckoutReference
} from "./smartShippingV3CheckoutReference.js"

export const prepareV3PaymentOperation = async ({
  orderId,
  amountCents
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new Error("Invalid V3 payment operation.")
  }

  const id = String(orderId).toLowerCase()
  const checkoutReferenceId = createV3CheckoutReference({
    orderId: id
  })

  let operation = await PaymentOperation.findOne({
    orderId: id
  })

  if (!operation) {
    try {
      operation = await PaymentOperation.create({
        orderId: id,
        idempotencyKey: `signavi-v3-sandbox-${crypto.randomUUID()}`,
        amountCents,
        environment: "sandbox",
        status: "pending",
        checkoutReferenceId
      })
    } catch (error) {
      if (error?.code !== 11000) throw error

      operation = await PaymentOperation.findOne({
        orderId: id
      })

      if (!operation) throw error
    }
  }

  if (
    operation.amountCents !== amountCents ||
    operation.environment !== "sandbox" ||
    operation.checkoutReferenceId !== checkoutReferenceId
  ) {
    throw new Error(
      "V3 payment amount or environment mismatch."
    )
  }

  if (operation.status !== "pending") {
    throw new Error(
      "V3 payment operation requires reconciliation."
    )
  }

  return {
    orderId: id,
    checkoutReferenceId,
    amountCents: operation.amountCents,
    idempotencyKey: operation.idempotencyKey,
    status: operation.status
  }
}