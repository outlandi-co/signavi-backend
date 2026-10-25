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
  inspectV3PendingSquareBinding
} from "../utils/smartShippingV3PendingSquareBinding.js"

const dbName = "signavi_shipping_v3_dev"

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  process.env.SMART_SHIPPING_V3_ENABLED === "true" ||
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED === "true" ||
  !process.env.MONGO_URI
) {
  throw new Error("STOP: Safe isolated Sandbox configuration required.")
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3SquareSafeCheckoutReference({ orderId })

assert.equal(reference.length, 35)
assert.ok(reference.length <= 40)
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`

let connected = false
let orderCreated = false
let operationCreated = false

try {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(mongoose.connection.db.databaseName, dbName)

  await Order.collection.insertOne({
    _id: id,
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: ""
  })

  orderCreated = true

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

  operationCreated = true

  const order = await Order.collection.findOne({ _id: id })
  const operation = await PaymentOperation.collection.findOne({
    orderId: id,
    idempotencyKey: key
  })

  const assessment = inspectV3PendingSquareBinding({
    order,
    operation
  })

  assert.equal(assessment.consistent, true)

  console.log("ISOLATED DATABASE: PASS")
  console.log("ONE-DOLLAR TEST ORDER: PASS")
  console.log("PAYMENT OPERATION BINDING: PASS")
  console.log("NO CHECKOUT LOCK ACQUIRED: PASS")
  console.log("NO SQUARE REQUEST RESERVED: PASS")
  console.log("NO SQUARE PAYMENT CREATED: PASS")
  console.log("FIXTURE ORDER ID:", orderId)
  console.log("FIXTURE PERSISTED FOR NEXT STEP")
} catch (error) {
  if (connected) {
    let operationSafeToRemove = !operationCreated

    if (operationCreated) {
      try {
        const result = await PaymentOperation.collection.deleteOne({
          orderId: id,
          idempotencyKey: key,
          status: "pending",
          requestOwner: "",
          squarePaymentLinkId: "",
          squareOrderId: "",
          paymentUrl: "",
          squareCreationAttemptClaimedAt: null
        })

        operationSafeToRemove = result.deletedCount === 1
      } catch {
        operationSafeToRemove = false
      }
    }

    if (orderCreated && operationSafeToRemove) {
      try {
        const result = await Order.collection.deleteOne({
          _id: id,
          paymentStatus: "unpaid",
          squarePaymentLinkId: "",
          squareExpectedAmountCents: 100
        })

        if (result.deletedCount !== 1) {
          console.error("FIXTURE ORDER REQUIRES INSPECTION:", orderId)
        }
      } catch {
        console.error("FIXTURE ORDER CLEANUP FAILED:", orderId)
      }
    }

    if (!operationSafeToRemove) {
      console.error("FIXTURE PRESERVED: payment operation requires inspection")
      console.error("FIXTURE ORDER ID:", orderId)
    }
  }

  console.error("SANDBOX FIXTURE PREPARATION FAILED")
  process.exitCode = 1
} finally {
  if (connected) await mongoose.disconnect()
}
