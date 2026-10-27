import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import { acquireV3CheckoutLock } from "../utils/smartShippingV3CheckoutLock.js"
import { createV3SquareSafeCheckoutReference } from "../utils/smartShippingV3CheckoutReference.js"
import { reserveV3SquareRequest } from "../utils/smartShippingV3ReserveSquareRequest.js"
import { claimV3SquareCreationAttempt } from "../utils/smartShippingV3ClaimCreationAttempt.js"
import { classifyV3SquareCreationOutcome } from "../utils/smartShippingV3CreationOutcome.js"

const dbName = "signavi_shipping_v3_dev"

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI
) {
  throw new Error("Isolated Sandbox configuration required.")
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3SquareSafeCheckoutReference({ orderId })
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`

let connected = false
let lock
let createCalls = 0

const reconnect = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })
  connected = true
  assert.equal(mongoose.connection.db.databaseName, dbName)
}

try {
  await reconnect()

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

  const claim = await claimV3SquareCreationAttempt({
    orderId,
    owner: lock.owner,
    idempotencyKey: key
  })

  assert.equal(claim.claimed, true)
  console.log("DURABLE ATTEMPT CLAIMED: PASS")

  // Simulate exactly one external call that times out.
  const simulatedSquareCreate = async () => {
    createCalls++
    throw new Error("Simulated Square timeout")
  }

  let failure
  try {
    await simulatedSquareCreate()
  } catch (error) {
    failure = error
  }

  const outcome = classifyV3SquareCreationOutcome({
    error: failure
  })

  assert.equal(createCalls, 1)
  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(outcome.safeToRetryCreation, false)
  console.log("UNKNOWN OUTCOME REQUIRES RECONCILIATION: PASS")

  await mongoose.disconnect()
  connected = false

  await reconnect()

  let operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.ok(operation.squareCreationAttemptClaimedAt)
  assert.equal(operation.status, "reconciliation_required")
  assert.equal(operation.requestOwner, lock.owner)
  assert.equal(operation.squarePaymentLinkId, "")

  console.log("UNKNOWN OUTCOME SURVIVES RECONNECTION: PASS")

  await assert.rejects(
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    })
  )

  assert.equal(createCalls, 1)
  console.log("SECOND CLAIM AFTER RECONNECT BLOCKED: PASS")

  const repeated = await Promise.allSettled([
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    }),
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    })
  ])

  assert.equal(
    repeated.filter(r => r.status === "fulfilled").length,
    0
  )
  assert.equal(createCalls, 1)

  operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "reconciliation_required")
  assert.ok(operation.squareCreationAttemptClaimedAt)

  const order = await Order.collection.findOne({ _id: id })
  assert.notEqual(String(order.paymentStatus).toLowerCase(), "paid")

  console.log("CONCURRENT REPEAT CLAIMS BLOCKED: PASS")
  console.log("ORDER REMAINS UNPAID: PASS")
  console.log("NO REAL SQUARE REQUESTS: PASS")
  console.log("ALL UNKNOWN OUTCOME RECOVERY TESTS PASSED")

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
  }
}