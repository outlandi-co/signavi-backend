import mongoose from "mongoose"

import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  createV3TrustedSandboxSdk
} from "./smartShippingV3TrustedSandboxSdk.js"

import {
  claimV3SquareCreationAttempt
} from "./smartShippingV3ClaimCreationAttempt.js"

import {
  markV3PaymentCompleted
} from "./smartShippingV3PaymentState.js"

import {
  runV3SandboxExecutionWorkflow
} from "./smartShippingV3ExecutionWorkflow.js"

// Internal server-only execution entry point.
//
// Requires an already-reserved operation and its lock
// owner. Never accepts amount, idempotency key,
// merchant ID, or location ID from the browser.
//
// No automatic creation retries.
// No Square request inside a MongoDB transaction.
// Production V2 routes are not used.

export const runV3TrustedSandboxExecution = async ({
  orderId,
  owner
}) => {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true" ||
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !== "true"
  ) {
    throw new Error("V3 trusted Sandbox execution disabled.")
  }

  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim()
  ) {
    throw new Error("Invalid trusted V3 execution identity.")
  }

  if (
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.db?.databaseName !==
      "signavi_shipping_v3_dev"
  ) {
    throw new Error("V3 isolated development database required.")
  }

  const id = String(orderId).toLowerCase()

  // Read persisted server-owned payment information.
  // The actual creation claim rechecks ownership
  // atomically in MongoDB.
  const operation = await PaymentOperation.findOne({
    orderId: id,
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: owner,
    squareCreationAttemptClaimedAt: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  }).lean()

  if (!operation) {
    throw new Error("V3 unclaimed reservation not found.")
  }

  const sdk = createV3TrustedSandboxSdk()

  return runV3SandboxExecutionWorkflow({
    orderId: id,
    owner,
    sdk,

    claimAttempt: () => claimV3SquareCreationAttempt({
      orderId: id,
      owner,
      idempotencyKey: operation.idempotencyKey
    }),

    recordVerifiedLink: data =>
      markV3PaymentCompleted({
        orderId: id,
        owner,
        amountCents: operation.amountCents,
        idempotencyKey: operation.idempotencyKey,
        squarePaymentLinkId: data.squarePaymentLinkId,
        squareOrderId: data.squareOrderId,
        paymentUrl: data.paymentUrl
      })
  })
}