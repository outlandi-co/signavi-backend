import crypto from "node:crypto"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  createV3SquareSafeCheckoutReference
} from "./smartShippingV3CheckoutReference.js"
import {
  classifyV3CheckoutReference
} from "./smartShippingV3ReferenceIdentity.js"

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
  // Only brand-new operations receive the Square-safe format.
  // Never regenerate the identity of an existing operation.
  const newCheckoutReferenceId =
    createV3SquareSafeCheckoutReference({ orderId: id })

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
        checkoutReferenceId: newCheckoutReferenceId
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
    classifyV3CheckoutReference({
      orderId: id,
      referenceId: operation.checkoutReferenceId
    }) === null
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
    checkoutReferenceId: operation.checkoutReferenceId,
    amountCents: operation.amountCents,
    idempotencyKey: operation.idempotencyKey,
    status: operation.status
  }
}
