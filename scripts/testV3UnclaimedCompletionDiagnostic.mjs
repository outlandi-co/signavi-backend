import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  claimV3SquareCreationAttempt
} from "../utils/smartShippingV3ClaimCreationAttempt.js"

import {
  markV3PaymentCompleted
} from "../utils/smartShippingV3PaymentState.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const owner = "isolated-diagnostic-owner"
const idempotencyKey = `signavi-v3-sandbox-${orderId}`

let replica

try {
  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1 }
  })

  await mongoose.connect(replica.getUri(), {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(mongoose.connection.db.databaseName, dbName)

  await PaymentOperation.init()

  await mongoose.connection.collection(
    "smart_shipping_v3_checkout_locks"
  ).insertOne({
    _id: orderId,
    owner,
    ownershipChecks: 0
  })

  await PaymentOperation.create({
    orderId,
    amountCents: 5528,
    idempotencyKey,
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: owner,
    squareCreationAttemptClaimedAt: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  await assert.rejects(
    markV3PaymentCompleted({
      orderId,
      owner,
      amountCents: 5528,
      idempotencyKey,
      paymentUrl: "https://square.link/u/mock",
      squarePaymentLinkId: "mock-link",
      squareOrderId: "mock-order"
    }),
    /V3 payment transition rejected/
  )

  const saved = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(saved.squareCreationAttemptClaimedAt, null)
  assert.equal(saved.status, "reconciliation_required")
  assert.equal(saved.squarePaymentLinkId, "")
  assert.equal(saved.squareOrderId, "")

  console.log("UNCLAIMED COMPLETION: BLOCKED")
  console.log("DATABASE STATE UNCHANGED: PASS")
  const claim = await claimV3SquareCreationAttempt({
    orderId,
    owner,
    idempotencyKey
  })

  assert.equal(claim.claimed, true)

  const claimedOperation = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.ok(
    claimedOperation.squareCreationAttemptClaimedAt instanceof Date
  )

  console.log("DURABLE CREATION CLAIM: PASS")

  const completion = await markV3PaymentCompleted({
    orderId,
    owner,
    amountCents: 5528,
    idempotencyKey,
    paymentUrl: "https://square.link/u/mock",
    squarePaymentLinkId: "mock-link",
    squareOrderId: "mock-order"
  })

  assert.equal(completion.status, "completed")

  const completedOperation = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(completedOperation.status, "completed")
  assert.equal(completedOperation.squarePaymentLinkId, "mock-link")
  assert.equal(completedOperation.squareOrderId, "mock-order")
  assert.ok(completedOperation.squareCreationAttemptClaimedAt)

  console.log("CLAIMED COMPLETION: PASS")
  console.log("IN-MEMORY REPLICA SET: VERIFIED")
  console.log("REAL SQUARE REQUESTS: ZERO")
  console.log("REMOTE DATABASE REQUESTS: ZERO")

} finally {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  if (replica) {
    await replica.stop()
  }
}