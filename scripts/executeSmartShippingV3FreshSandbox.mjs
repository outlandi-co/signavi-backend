import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  runV3OneShotTrustedExecution
} from "../utils/smartShippingV3OneShotOrchestration.js"

// REAL SQUARE-CAPABLE LAUNCHER.
// Do not execute without separate explicit authorization.
// Never automatically retry, reset claims, or release locks.

const ORDER_ID = process.argv[3]

// Fresh-order launcher. Reject historical protected orders.
const protectedOrderIds = new Set([
  "6add930c3b60c62003d103a6",
  "6add74398f0468ad2c712f5c",
  "6add3bf7d5de8ba32e8c736b",
  "6add4314594254dc4df63b61",
  "6adda4a38b33b7db3774a7da",
  "6addb0c222fc25ed65b4555f"
])

if (
  typeof ORDER_ID !== "string" ||
  !/^[a-f0-9]{24}$/.test(ORDER_ID) ||
  protectedOrderIds.has(ORDER_ID)
) {
  throw new Error("fresh_sandbox_order_required")
}
const DB_NAME = "signavi_shipping_v3_dev"

let connected = false
let reservationStarted = false

try {
  if (
    process.argv.length !== 4 ||
    process.argv[2] !== "--execute" ||
    process.argv[3] !== ORDER_ID
  ) {
    throw new Error("invalid_arguments")
  }

  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    throw new Error("environment_blocked")
  }

  if (
    process.env.SIGNAVI_V3_SANDBOX_ONE_SHOT_APPROVAL !== ORDER_ID
  ) {
    throw new Error("approval_missing")
  }

  if (
    process.env.SMART_SHIPPING_V3_ENABLED !== "true" ||
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !== "true"
  ) {
    throw new Error("feature_flags_disabled")
  }

  if (!process.env.MONGO_URI) {
    throw new Error("database_not_configured")
  }

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: DB_NAME,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.db.databaseName, DB_NAME)

  const id = new mongoose.Types.ObjectId(ORDER_ID)

  // ObjectId timestamp is a freshness check, not proof of origin.
  // Approval and persisted payment-state checks are still required.
  const ageMs = Date.now() - id.getTimestamp().getTime()

  if (
    !Number.isFinite(ageMs) ||
    ageMs < 0 ||
    ageMs > 15 * 60 * 1000
  ) {
    throw new Error("fresh_order_expired")
  }

  const [order, operations, existingLock] = await Promise.all([
    Order.collection.findOne({ _id: id }),
    PaymentOperation.collection
      .find({ orderId: id, environment: "sandbox" })
      .toArray(),
    mongoose.connection.db
      .collection("smart_shipping_v3_checkout_locks")
      .findOne({ _id: id })
  ])

  if (
    !order ||
    !["unpaid", "pending"].includes(order.paymentStatus) ||
    order.squareExpectedAmountCents !== 100 ||
    order.squarePaymentLinkId ||
    operations.length !== 1 ||
    existingLock
  ) {
    throw new Error("fixture_not_pending")
  }

  const operation = operations[0]
  const reference =
    createV3SquareSafeCheckoutReference({ orderId: ORDER_ID })

  if (
    operation.amountCents !== 100 ||
    operation.status !== "pending" ||
    operation.checkoutReferenceId !== reference ||
    operation.environment !== "sandbox" ||
    !operation.idempotencyKey ||
    operation.requestOwner ||
    operation.squareCreationAttemptClaimedAt != null ||
    operation.squarePaymentLinkId ||
    operation.squareOrderId ||
    operation.paymentUrl ||
    operation.squareDiagnostic != null
  ) {
    throw new Error("payment_operation_not_pristine")
  }

  // First irreversible coordination step.
  // Reservation may survive interruption.
  reservationStarted = true

  // Coordinated reservation and one trusted execution.
  // The helper independently verifies the payment identity.
  // Never retry after a failure or uncertain Square outcome.
  const result = await runV3OneShotTrustedExecution({
    orderId: ORDER_ID,
    expectedCheckoutReferenceId: reference,
    expectedIdempotencyKey: operation.idempotencyKey
  })

  console.log("EXECUTION RESULT:", result?.status ?? "unknown")
  console.log(
    "DIAGNOSTIC PERSISTED:",
    result?.diagnosticPersisted === true
  )
  console.log("NO AUTOMATIC RETRY")

  if (result?.status !== "completed") {
    throw new Error("reconciliation_required")
  }

  console.log("SANDBOX PAYMENT LINK VERIFIED")
  console.log("CUSTOMER PAYMENT NOT CONFIRMED")
} catch (error) {
  const safeCodes = new Set([
    "invalid_arguments",
    "environment_blocked",
    "approval_missing",
    "feature_flags_disabled",
    "database_not_configured",
    "fixture_not_pending",
    "payment_operation_not_pristine",
    "reservation_validation_failed",
    "reconciliation_required"
  ])

  const code = safeCodes.has(error?.message)
    ? error.message
    : "execution_stopped"

  console.error("ONE-SHOT SANDBOX STOPPED:", code)

  if (reservationStarted) {
    console.error("INSPECT PERSISTED STATE BEFORE ANY FURTHER ACTION")
    console.error("DO NOT RETRY OR RESET PAYMENT CLAIM")
  }

  process.exitCode = 1
} finally {
  if (connected) await mongoose.disconnect()
}