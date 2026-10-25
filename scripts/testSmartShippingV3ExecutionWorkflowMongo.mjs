import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  acquireV3CheckoutLock
} from "../utils/smartShippingV3CheckoutLock.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  reserveV3SquareRequest
} from "../utils/smartShippingV3ReserveSquareRequest.js"

import {
  claimV3SquareCreationAttempt
} from "../utils/smartShippingV3ClaimCreationAttempt.js"

import {
  markV3PaymentCompleted
} from "../utils/smartShippingV3PaymentState.js"

import {
  runV3SandboxExecutionWorkflow
} from "../utils/smartShippingV3ExecutionWorkflow.js"

const databaseName = "signavi_shipping_v3_dev"

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI
) {
  throw new Error("STOP: Isolated Sandbox test settings required.")
}

const originalFlags = {
  SMART_SHIPPING_V3_ENABLED: process.env.SMART_SHIPPING_V3_ENABLED,
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED:
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3SquareSafeCheckoutReference({ orderId })
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`

const linkId = `mock-link-${crypto.randomUUID()}`
const squareOrderId = `mock-order-${crypto.randomUUID()}`

let connected = false
let lock = null
let createCalls = 0
let recordCalls = 0
let lookupCalls = 0

try {
  process.env.SMART_SHIPPING_V3_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(
    mongoose.connection.db.databaseName,
    databaseName
  )

  await Order.collection.insertOne({
    _id: id,
    status: "payment_required",
    paymentStatus: "pending",
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

  lock = await acquireV3CheckoutLock(orderId)
  assert.ok(lock?.owner)

  const reservation = await reserveV3SquareRequest({
    orderId,
    owner: lock.owner
  })

  assert.equal(reservation.requestReserved, true)
  console.log("REAL MONGODB RESERVATION: PASS")

  const sdk = {
    merchantId: "mock-merchant",
    locationId: "mock-location",

    verifyIdentity: async () => ({
      verified: true,
      squareRequestAuthorized: false,
      merchantId: "mock-merchant",
      locationId: "mock-location"
    }),

    createPaymentLink: async request => {
      createCalls++

      assert.equal(request.idempotencyKey, key)
      assert.equal(request.order.referenceId, reference)
      assert.equal(request.order.locationId, "mock-location")
      assert.equal(
        request.order.lineItems[0].basePriceMoney.amount,
        5528n
      )

      return {
        paymentLink: {
          id: linkId,
          orderId: squareOrderId,
          url: "https://square.link/u/mock"
        }
      }
    },

    lookupClient: {
      checkout: {
        paymentLinks: {
          get: async () => {
            lookupCalls++
            return {
              paymentLink: {
                id: linkId,
                orderId: squareOrderId,
                url: "https://square.link/u/mock"
              }
            }
          }
        }
      },

      orders: {
        get: async () => {
          lookupCalls++
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

  const run = () => runV3SandboxExecutionWorkflow({
    orderId,
    owner: lock.owner,
    sdk,

    claimAttempt: () => claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    }),

    recordVerifiedLink: async data => {
      recordCalls++

      return markV3PaymentCompleted({
        orderId,
        owner: lock.owner,
        amountCents: 5528,
        idempotencyKey: key,
        ...data
      })
    }
  })

  const result = await run()

  assert.equal(result.status, "completed")
  assert.equal(result.paymentLinkRecorded, true)
  assert.equal(result.customerPaymentConfirmed, false)
  assert.equal(createCalls, 1)
  assert.equal(recordCalls, 1)
  assert.equal(lookupCalls, 2)

  console.log("DATABASE-BACKED WORKFLOW: PASS")

  let operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "completed")
  assert.ok(operation.squareCreationAttemptClaimedAt)
  assert.equal(operation.squarePaymentLinkId, linkId)
  assert.equal(operation.squareOrderId, squareOrderId)

  console.log("CLAIM AND VERIFIED LINK PERSISTED: PASS")

  // Simulate a database connection being closed and
  // re-established after the first durable claim.
  await mongoose.disconnect()
  connected = false

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000
  })
  connected = true

  assert.equal(
    mongoose.connection.db.databaseName,
    databaseName
  )

  const persisted = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.ok(persisted.squareCreationAttemptClaimedAt)
  assert.equal(persisted.status, "completed")

  console.log("CLAIM SURVIVES DATABASE RECONNECTION: PASS")

  await assert.rejects(run())

  assert.equal(createCalls, 1)
  assert.equal(recordCalls, 1)

  console.log("NO SECOND CREATION AFTER RECONNECTION: PASS")

  console.log("SECOND CREATION ATTEMPT BLOCKED: PASS")

  const order = await Order.collection.findOne({ _id: id })

  assert.notEqual(
    String(order.paymentStatus).toLowerCase(),
    "paid"
  )

  console.log("ORDER REMAINS UNPAID: PASS")
  console.log("ZERO REAL SQUARE CALLS: PASS")
  console.log("ALL DATABASE-BACKED WORKFLOW TESTS PASSED")

} finally {
  try {
    if (
      connected &&
      mongoose.connection.db.databaseName === databaseName
    ) {
      await mongoose.connection
        .collection("smart_shipping_v3_checkout_locks")
        .deleteOne({
          _id: id,
          ...(lock?.owner ? { owner: lock.owner } : {})
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

    for (const [name, value] of Object.entries(originalFlags)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}
