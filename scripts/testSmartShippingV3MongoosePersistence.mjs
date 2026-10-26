import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import "dotenv/config"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const DB = "signavi_shipping_v3_recovery_tests"
const ORDERS = "v3_mongoose_webhook_orders_synthetic"
const OPERATIONS = "v3_mongoose_webhook_operations_synthetic"

const uri =
  process.env.SIGNAVI_V3_TEST_MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URI

assert.ok(uri, "STOP: MongoDB URI unavailable")

const runId = crypto.randomUUID()
const orderId = new mongoose.Types.ObjectId()
const squareOrderId = `synthetic-square-${runId}`
const paymentId = `synthetic-payment-${runId}`

let connection
let SyntheticOrder
let SyntheticOperation

try {
  connection = mongoose.createConnection(uri, {
    dbName: DB,
    serverSelectionTimeoutMS: 7000,
    autoIndex: false,
    maxPoolSize: 5
  })

  await connection.asPromise()

  assert.equal(
    connection.db.databaseName,
    DB,
    "STOP: Unexpected database"
  )

  assert.notEqual(ORDERS, Order.collection.name)
  assert.notEqual(
    OPERATIONS,
    PaymentOperation.collection.name
  )

  SyntheticOrder = connection.model(
    "V3MongooseSyntheticOrder",
    Order.schema.clone(),
    ORDERS
  )

  SyntheticOperation = connection.model(
    "V3MongooseSyntheticOperation",
    PaymentOperation.schema.clone(),
    OPERATIONS
  )

  const order = new SyntheticOrder({
    _id: orderId,
    customerName: "Synthetic Webhook Test",
    email: "synthetic@example.invalid",
    source: "store",
    finalPrice: 1,
    currency: "usd",
    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 100,
    squareOrderId: "",
    squarePaymentId: "",
    timeline: []
  })

  const operation = new SyntheticOperation({
    orderId,
    environment: "sandbox",
    status: "completed",
    checkoutReferenceId: `signavi-v3-${orderId}`,
    requestOwner: "synthetic-owner",
    idempotencyKey: `signavi-v3-sandbox-synthetic-${runId}`,
    amountCents: 100,
    squarePaymentLinkId: `synthetic-link-${runId}`,
    squareOrderId,
    paymentUrl: "https://sandbox.square.link/u/synthetic"
  })

  await order.validate()
  await operation.validate()

  console.log("REAL MONGOOSE SCHEMA VALIDATION: PASS")

  await order.save()
  await operation.save()

  const savedOrder = await SyntheticOrder.findById(orderId).lean()
  const savedOperation = await SyntheticOperation.findOne({
    orderId
  }).lean()

  assert.ok(savedOrder)
  assert.ok(savedOperation)

  assert.equal(savedOrder.status, "payment_required")
  assert.equal(savedOrder.paymentStatus, "unpaid")
  assert.equal(savedOperation.status, "completed")

  console.log("MONGOOSE SYNTHETIC DOCUMENT PERSISTENCE: PASS")

  const originalTimelineCount = savedOrder.timeline.length

  const atomicPay = async () =>
    SyntheticOrder.findOneAndUpdate(
      {
        _id: orderId,
        squareEnvironment: "sandbox",
        paymentStatus: {
          $nin: ["paid", "refunded"]
        },
        status: {
          $nin: [
            "cancelled",
            "canceled",
            "refunded",
            "production",
            "shipped",
            "delivered",
            "completed"
          ]
        },
        squarePaymentId: {
          $in: [null, "", paymentId]
        },
        $or: [
          { squareOrderId: { $exists: false } },
          { squareOrderId: null },
          { squareOrderId: "" },
          { squareOrderId }
        ]
      },
      {
        $set: {
          status: "paid",
          paymentStatus: "paid",
          paymentMethod: "Square",
          squarePaymentId: paymentId,
          squareOrderId,
          squareExpectedAmountCents: 100,
          paidAt: new Date()
        },
        $push: {
          timeline: {
            status: "paid",
            date: new Date(),
            note: "Synthetic verified payment"
          }
        }
      },
      { new: true }
    )

  const results = await Promise.all([
    atomicPay(),
    atomicPay()
  ])

  assert.equal(
    results.filter(Boolean).length,
    1,
    "Only one payment transition may succeed"
  )

  const paid = await SyntheticOrder.findById(orderId).lean()

  assert.equal(paid.status, "paid")
  assert.equal(paid.paymentStatus, "paid")
  assert.equal(paid.squarePaymentId, paymentId)
  assert.equal(paid.squareOrderId, squareOrderId)
  assert.equal(
    paid.timeline.length,
    originalTimelineCount + 1
  )

  console.log("MONGOOSE CONCURRENT PAYMENT UPDATE: ONE WRITE")

  assert.equal(await atomicPay(), null)

  const replayed = await SyntheticOrder.findById(orderId).lean()

  assert.equal(
    replayed.timeline.length,
    originalTimelineCount + 1
  )

  console.log("MONGOOSE PAYMENT REPLAY: NO SECOND WRITE")
  console.log("ALL MONGOOSE PERSISTENCE SCENARIOS: PASS")
} finally {
  if (connection) {
    try {
      if (connection.readyState === 1) {
        const orders = connection.db.collection(ORDERS)
        const operations = connection.db.collection(OPERATIONS)

        const removedOrders = await orders.deleteMany({
          _id: orderId
        })

        const removedOperations = await operations.deleteMany({
          orderId
        })

        assert.ok(removedOrders.deletedCount <= 1)
        assert.ok(removedOperations.deletedCount <= 1)

        console.log(
          "SYNTHETIC CLEANUP:",
          removedOrders.deletedCount,
          "orders,",
          removedOperations.deletedCount,
          "operations"
        )
      }
    } finally {
      await connection.close()
    }
  }
}

console.log("NO PRODUCTION COLLECTIONS MODIFIED")
console.log("NO REAL SQUARE API REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("NO DEPLOYMENT")