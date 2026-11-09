import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  createV3SquareSafeCheckoutReference
} from "./smartShippingV3CheckoutReference.js"
import {
  assertV3PreclaimSquareReference
} from "./smartShippingV3PreclaimReferenceGuard.js"

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

  const id = String(orderId).toLowerCase()

  const expectedReference =
    createV3SquareSafeCheckoutReference({ orderId: id })

  assertV3PreclaimSquareReference({
    orderId: id,
    checkoutReferenceId: expectedReference
  })

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
          checkoutReferenceId: expectedReference,
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

/* ===== ISOLATED V3 SANDBOX SQUARE CLAIM ===== */

export const claimV3IsolatedSquareCreationAttempt = async ({
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
    throw new Error("Invalid isolated V3 creation-attempt claim.")
  }

  const id = String(orderId).toLowerCase()

  const expectedReference =
    createV3SquareSafeCheckoutReference({ orderId: id })

  assertV3PreclaimSquareReference({
    orderId: id,
    checkoutReferenceId: expectedReference
  })

  const { runV3SandboxAtomicTransition } = await import(
    "./v3SandboxAtomicTransition.js"
  )

  return runV3SandboxAtomicTransition({
    orderId: id,
    owner,

    transition: async ({ session, connection, models }) => {
      const PaymentOperation = models.PaymentOperation

      if (PaymentOperation?.db !== connection) {
        throw new Error("V3_SANDBOX_PAYMENT_MODEL_MISMATCH")
      }

      const operation = await PaymentOperation.findOneAndUpdate(
        {
          orderId: id,
          environment: "sandbox",
          status: "reconciliation_required",
          requestOwner: owner,
          idempotencyKey,
          checkoutReferenceId: expectedReference,
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
