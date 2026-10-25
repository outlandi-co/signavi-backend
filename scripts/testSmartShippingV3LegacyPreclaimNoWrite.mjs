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
  reserveV3SquareRequest
} from "../utils/smartShippingV3ReserveSquareRequest.js"
import {
  claimV3SquareCreationAttempt
} from "../utils/smartShippingV3ClaimCreationAttempt.js"
import {
  runV3TrustedSandboxExecutionForTests
} from "../utils/smartShippingV3TrustedExecution.js"
import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const dbName = "signavi_shipping_v3_dev"

if (
  !["test", "development"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI
) {
  throw new Error("Isolated Sandbox environment required.")
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`
const safe = createV3SquareSafeCheckoutReference({ orderId })
const legacy = createV3CheckoutReference({ orderId })

assert.equal(safe.length, 35)
assert.equal(legacy.length, 43)

const previous = {
  NODE_ENV: process.env.NODE_ENV,
  SMART_SHIPPING_V3_ENABLED:
    process.env.SMART_SHIPPING_V3_ENABLED,
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED:
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
}

let connected = false
let sdkCalls = 0

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
    checkoutReferenceId: safe,
    idempotencyKey: key,
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  const lock = await acquireV3CheckoutLock(orderId)
  assert.ok(lock?.owner)

  const reservation = await reserveV3SquareRequest({
    orderId,
    owner: lock.owner
  })

  assert.equal(reservation.requestReserved, true)
  console.log("ISOLATED PAYMENT RESERVATION: PASS")

  // Simulate a stored reference being changed between
  // reservation and payment creation.
  const changed = await PaymentOperation.collection.updateOne(
    { orderId: id, checkoutReferenceId: safe },
    { $set: { checkoutReferenceId: legacy } }
  )

  assert.equal(changed.modifiedCount, 1)

  const before = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(before.status, "reconciliation_required")
  assert.equal(before.requestOwner, lock.owner)
  assert.equal(before.squareCreationAttemptClaimedAt ?? null, null)

  await assert.rejects(
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    })
  )

  const afterClaim = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(afterClaim.checkoutReferenceId, legacy)
  assert.equal(afterClaim.squareCreationAttemptClaimedAt ?? null, null)
  assert.equal(afterClaim.status, before.status)
  assert.equal(afterClaim.requestOwner, before.requestOwner)
  assert.equal(afterClaim.idempotencyKey, before.idempotencyKey)

  console.log("LEGACY ATOMIC CLAIM REJECTED: PASS")
  console.log("ZERO DURABLE CLAIM WRITES: PASS")

  const sdk = {
    lookupClient: {},
    verifyIdentity: async () => {
      sdkCalls++
      throw new Error("Mock SDK should not be reached.")
    },
    createPaymentLink: async () => {
      sdkCalls++
      throw new Error("Mock Square creation should not be reached.")
    }
  }

  await assert.rejects(
    runV3TrustedSandboxExecutionForTests({
      orderId,
      owner: lock.owner,
      sdk
    })
  )

  assert.equal(sdkCalls, 0)

  const afterExecutor = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(
    afterExecutor.squareCreationAttemptClaimedAt ?? null,
    null
  )
  assert.equal(afterExecutor.checkoutReferenceId, legacy)
  assert.equal(afterExecutor.squarePaymentLinkId, "")
  assert.equal(afterExecutor.paymentUrl, "")

  console.log("TRUSTED EXECUTOR REJECTS LEGACY: PASS")
  console.log("ZERO MOCK SQUARE CALLS: PASS")
  console.log("CLAIM REMAINS UNCONSUMED: PASS")
  console.log("LEGACY PRECLAIM NO-WRITE REGRESSION: PASS")
} finally {
  if (connected) {
    try {
      if (mongoose.connection.db?.databaseName === dbName) {
        await mongoose.connection
          .collection("smart_shipping_v3_checkout_locks")
          .deleteMany({
            orderId: { $in: [id, orderId] }
          })

        await PaymentOperation.collection.deleteMany({
          orderId: { $in: [id, orderId] }
        })

        await Order.collection.deleteOne({ _id: id })

        console.log("ISOLATED FIXTURES CLEANED")
      }
    } finally {
      await mongoose.disconnect()
    }
  }

  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}
