import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"

import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  assertV3PreclaimSquareReference
} from "../utils/smartShippingV3PreclaimReferenceGuard.js"
import {
  runV3TrustedSandboxExecution
} from "../utils/smartShippingV3TrustedExecution.js"

const DB_NAME = "signavi_shipping_v3_dev"

const PROTECTED_ORDER_IDS = new Set([
  "6add74398f0468ad2c712f5c",
  "6add3bf7d5de8ba32e8c736b",
  "6add4314594254dc4df63b61"
])

const ORDER_ID = process.argv[3]

let connected = false

try {
  if (
    process.argv.length !== 4 ||
    process.argv[2] !== "--execute" ||
    !mongoose.isValidObjectId(ORDER_ID) ||
    String(ORDER_ID) !== String(ORDER_ID).toLowerCase() ||
    PROTECTED_ORDER_IDS.has(ORDER_ID)
  ) {
    throw new Error("Explicit --execute argument required.")
  }

  assert.ok(
    ["development", "test"].includes(process.env.NODE_ENV),
    "Development/test mode required."
  )

  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox")

  if (
    process.env.SIGNAVI_V3_SANDBOX_ONE_SHOT_APPROVAL !== ORDER_ID
  ) {
    throw new Error("Exact-order authorization required.")
  }

  if (process.env.SMART_SHIPPING_V3_ENABLED !== "true") {
    throw new Error("V3_FEATURE_FLAG_DISABLED")
  }

  if (
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !== "true"
  ) {
    throw new Error("SQUARE_CREATE_FLAG_DISABLED")
  }

  assert.ok(process.env.MONGO_URI)

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: DB_NAME,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(mongoose.connection.db.databaseName, DB_NAME)

  const orderId = new mongoose.Types.ObjectId(ORDER_ID)

  const operations = await PaymentOperation.collection
    .find({ orderId, environment: "sandbox" })
    .toArray()

  assert.equal(operations.length, 1)

  const operation = operations[0]

  assert.equal(operation.amountCents, 100)
  assert.equal(operation.status, "reconciliation_required")
  assert.ok(operation.requestOwner)
  assert.ok(operation.idempotencyKey)
  assert.ok(operation.checkoutReferenceId)

  assertV3PreclaimSquareReference({
    orderId: ORDER_ID,
    checkoutReferenceId: operation.checkoutReferenceId
  })

  assert.ok(operation.squareCreationAttemptClaimedAt == null)
  assert.equal(operation.squarePaymentLinkId, "")
  assert.equal(operation.squareOrderId, "")
  assert.equal(operation.paymentUrl, "")
  assert.ok(operation.squareDiagnostic == null)

  const lock = await mongoose.connection
    .collection("smart_shipping_v3_checkout_locks")
    .findOne({
      _id: orderId,
      owner: operation.requestOwner
    })

  assert.ok(lock, "Checkout owner lock missing.")

  console.log("CONTROLLED SANDBOX EXECUTION AUTHORIZED")
  console.log("TARGET ORDER:", ORDER_ID)
  console.log("AMOUNT: $1.00 USD")
  console.log("NO AUTOMATIC RETRY")

  // This is the ONLY Square-capable execution call.
  // The trusted workflow performs the durable creation claim.
  const result = await runV3TrustedSandboxExecution({
    orderId: ORDER_ID,
    owner: operation.requestOwner
  })

  // Never print raw Square errors, credentials, or payment URLs.
  console.log("RESULT STATUS:", result?.status ?? "unknown")
  console.log(
    "DIAGNOSTIC PERSISTED:",
    result?.diagnosticPersisted === true
  )

  if (result?.diagnostic) {
    const diagnostic = result.diagnostic

    console.log("SAFE DIAGNOSTIC:", JSON.stringify({
      type: diagnostic.type ?? null,
      statusCode: diagnostic.statusCode ?? null,
      category: diagnostic.category ?? null,
      code: diagnostic.code ?? null,
      field: diagnostic.field ?? null,
      outcomeKnown: diagnostic.outcomeKnown === true
    }))
  }

  if (result?.status !== "completed") {
    console.log("RECONCILIATION REQUIRED — DO NOT RETRY")
    process.exitCode = 1
  } else {
    console.log("SANDBOX PAYMENT LINK CREATION VERIFIED")
    console.log("CUSTOMER PAYMENT NOT YET CONFIRMED")
  }

} catch (error) {
  const reason = error?.message

  const safeReasons = new Map([
    ["Explicit --execute argument required.", "missing_or_protected_order"],
    ["Development/test mode required.", "environment_blocked"],
    ["Exact-order authorization required.", "authorization_blocked"],
    ["Checkout owner lock missing.", "checkout_lock_missing"]
  ])

  let code = safeReasons.get(reason) ?? "execution_stopped"

  if (reason === "V3_FEATURE_FLAG_DISABLED") {
    code = "v3_flag_disabled"
  }

  if (reason === "SQUARE_CREATE_FLAG_DISABLED") {
    code = "square_create_flag_disabled"
  }

  console.error("CONTROLLED EXECUTION STOPPED:", code)
  process.exitCode = 1
} finally {
  if (connected) await mongoose.disconnect()
}
