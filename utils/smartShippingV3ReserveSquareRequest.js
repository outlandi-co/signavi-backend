import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"

import {
  inspectV3PendingSquareBinding
} from "./smartShippingV3PendingSquareBinding.js"

// Atomically validates persisted payment records and
// reserves a single Square request under lock ownership.
//
// This DOES NOT make or authorize a Square API request.
// Merchant/location trust must be established separately.
// Never put external network calls inside this transaction.

export const reserveV3SquareRequest = async ({
  orderId,
  owner
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim()
  ) {
    throw new Error("Invalid V3 Square request reservation.")
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
          `V3 Square reservation rejected: ${assessment.reason}`
        )
      }

      const updated = await PaymentOperation.findOneAndUpdate(
        {
          _id: operation._id,
          orderId: id,
          environment: "sandbox",
          status: "pending",
          requestOwner: "",
          amountCents: assessment.amountCents,
          checkoutReferenceId:
            assessment.checkoutReferenceId,
          idempotencyKey: operation.idempotencyKey,
          squarePaymentLinkId: "",
          squareOrderId: "",
          paymentUrl: ""
        },
        {
          $set: {
            status: "reconciliation_required",
            requestOwner: owner,
            lastError:
              "Square request reserved; external outcome unknown."
          }
        },
        {
          session,
          returnDocument: "after"
        }
      )

      if (!updated) {
        throw new Error(
          "V3 Square request reservation lost concurrency race."
        )
      }

      return Object.freeze({
        orderId: id,
        owner,
        amountCents: assessment.amountCents,
        checkoutReferenceId:
          assessment.checkoutReferenceId,
        idempotencyKey: updated.idempotencyKey,
        environment: "sandbox",
        status: "reconciliation_required",
        requestReserved: true,
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }
  })
}