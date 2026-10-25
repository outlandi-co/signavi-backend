import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import { acquireAndReserveV3Checkout } from "../utils/smartShippingV3AcquireAndReserve.js"
import { createV3SquareSafeCheckoutReference } from "../utils/smartShippingV3CheckoutReference.js"
import { runV3TrustedSandboxExecutionForTests } from "../utils/smartShippingV3TrustedExecution.js"

const dbName = "signavi_shipping_v3_dev"

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI
) {
  throw new Error("STOP: Isolated test configuration required.")
}

const originals = {
  NODE_ENV: process.env.NODE_ENV,
  SMART_SHIPPING_V3_ENABLED: process.env.SMART_SHIPPING_V3_ENABLED,
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED:
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3SquareSafeCheckoutReference({ orderId })
assert.equal(reference.length, 35)
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`
const linkId = `mock-link-${crypto.randomUUID()}`
const squareOrderId = `mock-order-${crypto.randomUUID()}`

let connected = false
let lock
let createCalls = 0
let recordLookups = 0

try {
  process.env.NODE_ENV = "test"
  process.env.SMART_SHIPPING_V3_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.db.databaseName, dbName)

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

  lock = await acquireAndReserveV3Checkout({ orderId })
  assert.ok(lock?.owner)

  const reservation = lock
  assert.equal(reservation.requestReserved, true)

  console.log("TRUSTED MONGODB RESERVATION: PASS")

  // A second coordinator must not acquire or reserve
  // the same checkout while the first lock is held.
  await assert.rejects(
    acquireAndReserveV3Checkout({ orderId }),
    /checkout lock unavailable/
  )

  const reservedOperation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(reservedOperation.status, "reconciliation_required")
  assert.equal(reservedOperation.requestOwner, lock.owner)
  assert.ok(reservedOperation.squareCreationAttemptClaimedAt == null)
  assert.equal(createCalls, 0)

  console.log("DUPLICATE COORDINATION BLOCKED: PASS")
  console.log("CREATION CLAIM STILL UNUSED: PASS")

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
            recordLookups++
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

  const execute = owner =>
    runV3TrustedSandboxExecutionForTests({
      orderId,
      owner,
      sdk
    })

  await assert.rejects(
    execute("incorrect-owner"),
    /unclaimed reservation not found/
  )

  assert.equal(createCalls, 0)
  console.log("FOREIGN OWNER REJECTED: PASS")

  const result = await execute(lock.owner)

  assert.equal(result.status, "completed")
  assert.equal(result.verified, true)
  assert.equal(result.paymentLinkRecorded, true)
  assert.equal(result.customerPaymentConfirmed, false)
  assert.equal(createCalls, 1)
  assert.equal(recordLookups, 2)

  console.log("TRUSTED ENTRY COMPLETE WORKFLOW: PASS")

  const operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "completed")
  assert.ok(operation.squareCreationAttemptClaimedAt)
  assert.equal(operation.squarePaymentLinkId, linkId)
  assert.equal(operation.squareOrderId, squareOrderId)
  assert.equal(operation.amountCents, 5528)
  assert.equal(operation.idempotencyKey, key)

  console.log("SERVER-OWNED PAYMENT FIELDS PERSISTED: PASS")

  await assert.rejects(
    execute(lock.owner),
    /unclaimed reservation not found/
  )

  assert.equal(createCalls, 1)
  console.log("REPEATED CREATION BLOCKED: PASS")

  const order = await Order.collection.findOne({ _id: id })
  assert.notEqual(String(order.paymentStatus).toLowerCase(), "paid")

  console.log("ORDER NOT MARKED PAID: PASS")
  console.log("ZERO REAL SQUARE NETWORK REQUESTS: PASS")
  console.log("ALL TRUSTED ENTRY MONGODB TESTS PASSED")
} finally {
  try {
    if (
      connected &&
      mongoose.connection.db.databaseName === dbName
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

    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}