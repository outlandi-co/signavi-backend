import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  runV3OneShotTrustedExecution
} from "../utils/smartShippingV3OneShotOrchestration.js"

const DB_NAME = "signavi_shipping_v3_dev"
const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`
const reference = createV3SquareSafeCheckoutReference({ orderId })

let connected = false
let owner = null

try {
  assert.ok(["development", "test"].includes(process.env.NODE_ENV))
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox")
  assert.notEqual(
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED,
    "true"
  )
  assert.ok(process.env.MONGO_URI)

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: DB_NAME,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.db.databaseName, DB_NAME)

  await Order.collection.insertOne({
    _id: id,
    status: "payment_required",
    paymentStatus: "pending",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: ""
  })

  await PaymentOperation.collection.insertOne({
    orderId: id,
    amountCents: 100,
    environment: "sandbox",
    status: "pending",
    checkoutReferenceId: reference,
    idempotencyKey: key,
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  // A mismatched identity must stop after reservation,
  // before the trusted Square executor is invoked.
  await assert.rejects(
    runV3OneShotTrustedExecution({
      orderId,
      expectedCheckoutReferenceId: `${reference}-incorrect`,
      expectedIdempotencyKey: key
    }),
    /V3 one-shot payment identity mismatch/
  )

  const operation = await PaymentOperation.collection.findOne({
    orderId: id,
    idempotencyKey: key
  })

  assert.ok(operation)
  owner = operation.requestOwner

  assert.equal(operation.status, "reconciliation_required")
  assert.ok(owner)
  assert.equal(operation.checkoutReferenceId, reference)
  assert.ok(operation.squareCreationAttemptClaimedAt == null)
  assert.ok(!operation.squarePaymentLinkId)
  assert.ok(!operation.squareOrderId)
  assert.ok(!operation.paymentUrl)

  const lock = await mongoose.connection.db
    .collection("smart_shipping_v3_checkout_locks")
    .findOne({ _id: id, owner })

  assert.ok(lock)
  assert.ok(lock.expiresAt > new Date())

  const order = await Order.collection.findOne({ _id: id })
  assert.equal(order.paymentStatus, "pending")

  console.log("MISMATCHED CHECKOUT REFERENCE REJECTED: PASS")
  console.log("RESERVATION REMAINS RECONCILIATION REQUIRED: PASS")
  console.log("ORIGINAL LOCK OWNERSHIP RETAINED: PASS")
  console.log("DURABLE CREATION CLAIM UNUSED: PASS")
  console.log("ORDER REMAINS UNPAID: PASS")
  console.log("TRUSTED EXECUTOR NOT REACHED: PASS")
  console.log("NO SQUARE REQUESTS: PASS")
} finally {
  try {
    if (
      connected &&
      mongoose.connection.db?.databaseName === DB_NAME
    ) {
      const locks = mongoose.connection.db.collection(
        "smart_shipping_v3_checkout_locks"
      )

      await locks.deleteOne({
        _id: id,
        ...(owner ? { owner } : {})
      })

      await PaymentOperation.collection.deleteOne({
        orderId: id,
        idempotencyKey: key
      })

      await Order.collection.deleteOne({ _id: id })

      console.log("ISOLATED FIXTURES CLEANED")
    }
  } finally {
    if (connected) await mongoose.disconnect()
  }
}