import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  runV3OwnedPaymentTransition
} from "./smartShippingV3AtomicTransition.js"

// Durable, one-time claim.
//
// This grants NO permission to contact Square.
// The actual Sandbox executor must separately verify
// merchant identity and all execution gates.
//
// Never reset the claim after an unknown Square outcome.

export const claimV3SquareCreationAttempt = async ({
  orderId,
  owner,
  idempotencyKey
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    typeof idempotencyKey !== "string" ||
    !idempotencyKey.startsWith("signavi-v3-sandbox-")
  ) {
    throw new Error("Invalid V3 creation-attempt claim.")
  }

  return runV3OwnedPaymentTransition({
    orderId,
    owner,
    transition: async session => {
      const operation = await PaymentOperation.findOneAndUpdate(
        {
          orderId,
          environment: "sandbox",
          status: "reconciliation_required",
          requestOwner: owner,
          idempotencyKey,
          squarePaymentLinkId: "",
          squareOrderId: "",
          paymentUrl: "",
          squareCreationAttemptClaimedAt: null
        },
        {
          $set: {
            squareCreationAttemptClaimedAt: new Date(),
            lastError:
              "Square creation attempt claimed; external outcome unknown."
          }
        },
        {
          session,
          returnDocument: "after"
        }
      )

      if (!operation) {
        throw new Error(
          "V3 creation attempt already claimed or reservation invalid."
        )
      }

      return Object.freeze({
        claimed: true,
        orderId: String(operation.orderId),
        idempotencyKey: operation.idempotencyKey,
        amountCents: operation.amountCents,
        checkoutReferenceId: operation.checkoutReferenceId,
        claimedAt:
          operation.squareCreationAttemptClaimedAt.toISOString(),
        squareRequestAuthorized: false,
        paymentCreated: false
      })
    }
  })
}