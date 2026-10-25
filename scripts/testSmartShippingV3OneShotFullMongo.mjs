import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import { createV3SquareSafeCheckoutReference } from "../utils/smartShippingV3CheckoutReference.js"
import { runV3OneShotExecutionForTests } from "../utils/smartShippingV3OneShotOrchestration.js"

// Isolated, mock-only integration regression.
// NEVER execute the real one-shot launcher here.

const dbName = "signavi_shipping_v3_dev"

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI ||
  process.env.SMART_SHIPPING_V3_ENABLED === "true" ||
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED === "true"
) {
  throw new Error("STOP: Isolated mock-only configuration required.")
}

process.env.NODE_ENV = "test"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3SquareSafeCheckoutReference({ orderId })
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`
const linkId = `mock-link-${crypto.randomUUID()}`
const squareOrderId = `mock-order-${crypto.randomUUID()}`
const mockUrl = "https://square.link/u/mock"

let connected = false
let createCalls = 0
let recordLookups = 0
let completed = false
let savedOwner = null

const sdk = {
  merchantId: "mock-merchant",
  locationId: "mock-location",
  verifyIdentity: async () => ({
    verified: true,
    merchantId: "mock-merchant",
    locationId: "mock-location",
    squareRequestAuthorized: false
  }),
  createPaymentLink: async request => {
    createCalls++
    assert.equal(createCalls, 1)
    assert.equal(request.idempotencyKey, key)
    assert.equal(request.order.referenceId, reference)
    assert.equal(request.order.locationId, "mock-location")
    assert.equal(request.order.lineItems[0].basePriceMoney.amount, 5528n)
    return {
      paymentLink: {
        id: linkId,
        orderId: squareOrderId,
        url: mockUrl
      }
    }
  },
  lookupClient: {
    checkout: {
      paymentLinks: {
        get: async () => {
          recordLookups++
          return {
            paymentLink: {
              id: linkId,
              orderId: squareOrderId,
              url: mockUrl
            }
          }
        }
      }
    },
    orders: {
      get: async () => {
        recordLookups++
        return {
          order: {
            id: squareOrderId,
            referenceId: reference,
            locationId: "mock-location",
            totalMoney: {
              amount: 5528n,
              currency: "USD"
            }
          }
        }
      }
    }
  }
}

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
    squareExpectedAmountCents: 5528,
    squarePaymentLinkId: ""
  })

  await PaymentOperation.collection.insertOne({
    orderId: id,
    amountCents: 5528,
    environment: "sandbox",
    status: "pending",
    checkoutReferenceId: reference,
    idempotencyKey: key,
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  const result = await runV3OneShotExecutionForTests({
    orderId,
    sdk
  })

  assert.equal(result.status, "completed")
  assert.equal(result.verified, true)
  assert.equal(result.paymentLinkRecorded, true)
  assert.equal(result.customerPaymentConfirmed, false)
  console.log("FULL ONE-SHOT MOCK ORCHESTRATION: PASS")

  assert.equal(createCalls, 1)
  assert.equal(recordLookups, 2)
  console.log("EXACTLY ONE MOCK PAYMENT CREATION: PASS")

  const locks = mongoose.connection.db.collection(
    "smart_shipping_v3_checkout_locks"
  )

  const [order, operation, lock] = await Promise.all([
    Order.collection.findOne({ _id: id }),
    PaymentOperation.collection.findOne({ orderId: id }),
    locks.findOne({ _id: id })
  ])

  assert.ok(order)
  assert.ok(operation)
  assert.ok(lock?.owner)

  savedOwner = lock.owner
  assert.equal(operation.requestOwner, savedOwner)
  console.log("RESERVATION OWNERSHIP MATCHES LOCK: PASS")

  assert.equal(operation.status, "completed")
  assert.equal(operation.checkoutReferenceId, reference)
  assert.equal(operation.idempotencyKey, key)
  assert.equal(operation.squarePaymentLinkId, linkId)
  assert.equal(operation.squareOrderId, squareOrderId)
  assert.ok(operation.squareCreationAttemptClaimedAt)
  console.log("DURABLE MOCK PAYMENT RECORDING: PASS")

  assert.equal(order.paymentStatus, "unpaid")
  assert.equal(order.squarePaymentLinkId, "")
  console.log("ORDER REMAINS UNPAID: PASS")

  await assert.rejects(
    runV3OneShotExecutionForTests({ orderId, sdk }),
    /checkout lock unavailable/
  )
  assert.equal(createCalls, 1)
  console.log("DUPLICATE ONE-SHOT EXECUTION BLOCKED: PASS")
  console.log("ZERO REAL SQUARE NETWORK REQUESTS: PASS")

  // Cleanup is allowed only after every success assertion.
  completed = true

} catch (error) {
  console.error("ISOLATED ONE-SHOT TEST FAILED:", error)
  console.error("PRESERVE FIXTURE ORDER ID:", orderId)
  process.exitCode = 1
} finally {
  try {
    if (connected && completed) {
      const locks = mongoose.connection.db.collection(
        "smart_shipping_v3_checkout_locks"
      )

      const [order, operation, lock] = await Promise.all([
        Order.collection.findOne({ _id: id }),
        PaymentOperation.collection.findOne({
          orderId: id,
          idempotencyKey: key
        }),
        locks.findOne({ _id: id })
      ])

      assert.equal(operation?.status, "completed")
      assert.equal(operation?.requestOwner, savedOwner)
      assert.equal(operation?.squarePaymentLinkId, linkId)
      assert.equal(operation?.squareOrderId, squareOrderId)
      assert.equal(lock?.owner, savedOwner)
      assert.equal(order?.paymentStatus, "unpaid")
      assert.equal(order?.squarePaymentLinkId, "")
      assert.equal(createCalls, 1)

      // Exact, freshly generated identities only.
      const removedOperation = await PaymentOperation.collection.deleteOne({
        _id: operation._id,
        orderId: id,
        idempotencyKey: key,
        status: "completed",
        requestOwner: savedOwner,
        squarePaymentLinkId: linkId,
        squareOrderId
      })
      assert.equal(removedOperation.deletedCount, 1)

      const removedLock = await locks.deleteOne({
        _id: id,
        owner: savedOwner
      })
      assert.equal(removedLock.deletedCount, 1)

      const removedOrder = await Order.collection.deleteOne({
        _id: id,
        paymentStatus: "unpaid",
        squareExpectedAmountCents: 5528,
        squarePaymentLinkId: ""
      })
      assert.equal(removedOrder.deletedCount, 1)

      console.log("ISOLATED FIXTURES CLEANED: PASS")
    }
  } catch (cleanupError) {
    console.error("CLEANUP REQUIRES INSPECTION:", cleanupError)
    console.error("FIXTURE ORDER ID:", orderId)
    process.exitCode = 1
  } finally {
    if (connected) await mongoose.disconnect()
  }
}