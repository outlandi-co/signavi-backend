import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"

import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const ORDER_ID = "6add74398f0468ad2c712f5c"
const DB_NAME = "signavi_shipping_v3_dev"

let connected = false

try {
  assert.ok(
    ["development", "test"].includes(process.env.NODE_ENV),
    "Development/test environment required."
  )

  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox")

  assert.notEqual(
    process.env.SMART_SHIPPING_V3_ENABLED,
    "true",
    "V3 must remain disabled for dry-run verification."
  )

  assert.notEqual(
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED,
    "true",
    "Square creation must remain disabled."
  )

  assert.ok(process.env.MONGO_URI)

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: DB_NAME,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.db.databaseName, DB_NAME)

  const orderId = new mongoose.Types.ObjectId(ORDER_ID)

  const operations = await PaymentOperation.collection
    .find({
      orderId,
      environment: "sandbox"
    })
    .toArray()

  assert.equal(operations.length, 1)

  const operation = operations[0]

  assert.equal(operation.amountCents, 100)
  assert.equal(operation.status, "reconciliation_required")
  assert.ok(operation.requestOwner)
  assert.ok(operation.idempotencyKey)
  assert.ok(operation.checkoutReferenceId)

  assert.ok(
    operation.squareCreationAttemptClaimedAt == null,
    "Creation attempt was already claimed."
  )

  assert.equal(operation.squarePaymentLinkId, "")
  assert.equal(operation.squareOrderId, "")
  assert.equal(operation.paymentUrl, "")

  const locks = mongoose.connection.collection(
    "smart_shipping_v3_checkout_locks"
  )

  const lock = await locks.findOne({
    _id: orderId,
    owner: operation.requestOwner
  })

  assert.ok(lock, "Checkout ownership lock missing.")

  console.log("TARGET ORDER:", ORDER_ID)
  console.log("ISOLATED DATABASE: PASS")
  console.log("SANDBOX ENVIRONMENT: PASS")
  console.log("ONE-DOLLAR AMOUNT: PASS")
  console.log("EXACTLY ONE PAYMENT OPERATION: PASS")
  console.log("CHECKOUT OWNER MATCH: PASS")
  console.log("DURABLE CLAIM UNCLAIMED: PASS")
  console.log("NO PAYMENT LINK RECORDED: PASS")
  console.log("V3 CREATION FLAGS DISABLED: PASS")
  console.log("NO SQUARE API REQUEST")
  console.log("NO DATABASE WRITES")
  console.log("CONTROLLED EXECUTION DRY RUN: PASS")

} catch (error) {
  console.error(
    "CONTROLLED EXECUTION CHECK FAILED:",
    error.message
  )
  process.exitCode = 1
} finally {
  if (connected) await mongoose.disconnect()
}