import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"

import {
  inspectV3PendingSquareBinding
} from "./smartShippingV3PendingSquareBinding.js"

// Verifies persisted records under the existing
// ownership-fenced MongoDB transaction.
//
// NO Square SDK, external API requests or payment creation.
//
// This transition updates the checkout lock's
// ownershipChecks counter as part of the existing
// fencing mechanism.
//
// This result is a consistency assessment only.
// It is NOT durable Square request authorization.

export const inspectV3PersistedPendingBinding = async ({
  orderId,
  owner
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim()
  ) {
    throw new Error(
      "Invalid persisted V3 payment inspection."
    )
  }

  const id = String(orderId).toLowerCase()

  return runV3OwnedPaymentTransition({
    orderId: id,
    owner,
    transition: async session => {
      const order = await Order.findById(id)
        .session(session)

      const operation = await PaymentOperation.findOne({
        orderId: id
      }).session(session)

      const assessment = inspectV3PendingSquareBinding({
        order,
        operation
      })

      if (!assessment.consistent) {
        throw new Error(
          `V3 pending payment records rejected: ${assessment.reason}`
        )
      }

      if (
        String(operation.orderId).toLowerCase() !== id ||
        operation.status !== "pending" ||
        operation.requestOwner !== ""
      ) {
        throw new Error(
          "V3 payment operation changed during inspection."
        )
      }

      return Object.freeze({
        consistent: true,
        orderId: id,
        amountCents: assessment.amountCents,
        checkoutReferenceId:
          assessment.checkoutReferenceId,
        idempotencyKey: operation.idempotencyKey,
        environment: "sandbox",
        reason: "persisted_pending_records_consistent",
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }
  })
}