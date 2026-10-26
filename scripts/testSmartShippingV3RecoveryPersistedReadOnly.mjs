import "dotenv/config"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  createV3RecoveryTrustedRecordLoader
} from "../utils/smartShippingV3RecoveryTrustedRecordLoader.js"

const DB_NAME = "signavi_shipping_v3_recovery_tests"
const PROTECTED_ORDER_ID = "6addc6f674d8362634569095"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

const uri = process.env.MONGO_URI

assert.ok(
  typeof uri === "string" && uri.trim(),
  "MONGO_URI is required. No connection attempted."
)

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3SquareSafeCheckoutReference({
  orderId
})
const key = `signavi-v3-sandbox-recovery-test-${randomUUID()}`

assert.notEqual(orderId, PROTECTED_ORDER_ID)

let connected = false
let orderInserted = false
let operationInserted = false

const assertDatabase = () => {
  if (
    mongoose.connection.readyState !== 1 ||
    mongoose.connection.name !== DB_NAME ||
    mongoose.connection.db?.databaseName !== DB_NAME
  ) {
    throw new Error("STOP: Isolated recovery database boundary failed.")
  }
}

try {
  await mongoose.connect(uri, {
    dbName: DB_NAME,
    autoIndex: false,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assertDatabase()

  console.log("ISOLATED TEST DATABASE CONNECTION: PASS")

  const orderFixture = {
    _id: id,
    squareEnvironment: "sandbox",
    currency: "USD",
    status: "payment_required",
    paymentStatus: "unpaid",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: "",
    createdAt: new Date(),
    updatedAt: new Date()
  }

  const operationFixture = {
    orderId: id,
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: "synthetic-recovery-test-owner",
    squareCreationAttemptClaimedAt: new Date(),
    idempotencyKey: key,
    checkoutReferenceId: reference,
    amountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: "",
    createdAt: new Date(),
    updatedAt: new Date()
  }

  // The only fixture insertions in this test database.
  assertDatabase()
  await Order.collection.insertOne(orderFixture)
  orderInserted = true

  assertDatabase()
  await PaymentOperation.collection.insertOne(operationFixture)
  operationInserted = true

  console.log("SYNTHETIC ORDER AND OPERATION INSERTED: PASS")

  const loader = createV3RecoveryTrustedRecordLoader()

  const beforeOrder = await Order.collection.findOne({ _id: id })
  const beforeOperation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  const records = await loader(orderId)

  assert.equal(String(records.order._id), orderId)
  assert.equal(String(records.operation.orderId), orderId)

  assert.equal(records.order.paymentStatus, "unpaid")
  assert.equal(records.order.status, "payment_required")
  assert.equal(records.operation.status, "reconciliation_required")
  assert.equal(records.operation.idempotencyKey, key)
  assert.equal(records.operation.checkoutReferenceId, reference)
  assert.equal(records.operation.amountCents, 100)

  const afterOrder = await Order.collection.findOne({ _id: id })
  const afterOperation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.deepEqual(afterOrder, beforeOrder)
  assert.deepEqual(afterOperation, beforeOperation)

  console.log("REAL PERSISTED RECORD LOADING: PASS")
  console.log("ORDER AND PAYMENT OPERATION UNCHANGED: PASS")

  await assert.rejects(
    loader("not-a-valid-order-id"),
    /Invalid V3 recovery order ID/
  )

  console.log("INVALID ORDER ID REJECTED: PASS")

  const unknownId = String(new mongoose.Types.ObjectId())

  assert.notEqual(unknownId, orderId)
  assert.notEqual(unknownId, PROTECTED_ORDER_ID)

  await assert.rejects(
    loader(unknownId),
    /persisted records missing or mismatched/
  )

  console.log("MISSING RECORDS REJECTED: PASS")

  console.log("NO SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")
  console.log("NO RECOVERY CLAIM RESET")
  console.log("PROTECTED ORIGINAL ORDER NOT ACCESSED")
} finally {
  if (connected && mongoose.connection.readyState === 1) {
    try {
      assertDatabase()

      // Delete only the exact synthetic fixture identities.
      if (operationInserted) {
        await PaymentOperation.collection.deleteOne({
          orderId: id,
          idempotencyKey: key
        })
      }

      if (orderInserted) {
        await Order.collection.deleteOne({
          _id: id
        })
      }

      const remainingOrder = await Order.collection.findOne({
        _id: id
      })

      const remainingOperation =
        await PaymentOperation.collection.findOne({
          orderId: id,
          idempotencyKey: key
        })

      assert.equal(remainingOrder, null)
      assert.equal(remainingOperation, null)

      console.log("EXACT SYNTHETIC FIXTURE CLEANUP: PASS")
    } finally {
      await mongoose.disconnect()
    }
  } else if (connected) {
    console.error(
      "WARNING: Connection unavailable. Synthetic fixture cleanup " +
      "could not be verified."
    )
    await mongoose.disconnect()
  }
}