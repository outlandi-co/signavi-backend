import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  coordinateV3RecoveryTestOnly
} from "../utils/smartShippingV3RecoveryTestCoordinator.js"

const dbName = "signavi_shipping_v3_recovery_tests"

const uri =
  `mongodb://127.0.0.1:27019/${dbName}?replicaSet=signaviV3Sandbox`

if (
  process.env.NODE_ENV !== "test" ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  process.env.SMART_SHIPPING_V3_RECOVERY_TEST_WRITES !== "true" ||
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !== "false"
) {
  throw new Error("STOP: Synthetic recovery test gates rejected.")
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const owner = `synthetic-owner-${crypto.randomUUID()}`
const idempotencyKey = `signavi-v3-sandbox-${crypto.randomUUID()}`

const reference = createV3SquareSafeCheckoutReference({
  orderId
})

const expectedPaymentLinkId = `mock-link-${crypto.randomUUID()}`
const squareOrderId = `mock-square-order-${crypto.randomUUID()}`
const paymentUrl = "https://sandbox.square.link/u/synthetic-test"

const claimedAt = new Date(Date.now() - 120000)
const expiredAt = new Date(Date.now() - 60000)

const verified = Object.freeze({
  verified: true,
  checkoutReferenceVerified: true,
  amountCents: 100,
  squarePaymentLinkId: expectedPaymentLinkId,
  squareOrderId,
  paymentUrl
})

let connected = false
let insertedOrder = false
let insertedOperation = false
let insertedLock = false
let inspections = 0

try {
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10000,
    retryWrites: false,
    autoIndex: false
  })

  connected = true

  assert.equal(mongoose.connection.db.databaseName, dbName)

  const hello = await mongoose.connection.db.admin().command({
    hello: 1
  })

  assert.equal(hello.setName, "signaviV3Sandbox")
  assert.equal(hello.isWritablePrimary, true)

  const locks = mongoose.connection.collection(
    "smart_shipping_v3_checkout_locks"
  )

  console.log("ISOLATED LOCAL REPLICA SET: PASS")

  await Order.collection.insertOne({
    _id: id,
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  insertedOrder = true

  await PaymentOperation.collection.insertOne({
    orderId: id,
    amountCents: 100,
    environment: "sandbox",
    status: "reconciliation_required",
    checkoutReferenceId: reference,
    idempotencyKey,
    requestOwner: owner,
    squareCreationAttemptClaimedAt: claimedAt,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  insertedOperation = true

  await locks.insertOne({
    _id: id,
    owner,
    expiresAt: expiredAt,
    ownershipChecks: 0
  })

  insertedLock = true

  const inspectionArgs = {
    orderId,
    expectedPaymentLinkId
  }

  // Injected inspection evidence is synthetic.
  // No Square SDK or network request is performed.
  const inspect = async () => {
    inspections++

    return {
      eligibleForFurtherReview: true,
      databaseWriteAuthorized: false,
      squareCreationAuthorized: false,
      claimResetAuthorized: false,
      customerPaymentConfirmed: false,
      paymentLinkRecorded: false,
      verified
    }
  }

  const result = await coordinateV3RecoveryTestOnly({
    orderId,
    owner,
    expectedPaymentLinkId,
    inspectionArgs,
    inspect
  })

  assert.equal(result.recorded, true)
  assert.equal(result.paymentLinkRecorded, true)
  assert.equal(result.customerPaymentConfirmed, false)
  assert.equal(inspections, 1)

  console.log("COORDINATOR TO MONGODB RECORDING: PASS")

  const operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "completed")
  assert.equal(operation.squarePaymentLinkId, expectedPaymentLinkId)
  assert.equal(operation.squareOrderId, squareOrderId)
  assert.equal(operation.paymentUrl, paymentUrl)
  assert.equal(
    operation.squareCreationAttemptClaimedAt.getTime(),
    claimedAt.getTime()
  )

  console.log("VERIFIED LINK AND DURABLE CLAIM: PASS")

  const order = await Order.collection.findOne({ _id: id })

  assert.equal(order.paymentStatus, "unpaid")
  assert.equal(order.status, "payment_required")
  assert.equal(order.squarePaymentLinkId, "")
  assert.equal(order.squareOrderId, "")

  console.log("CUSTOMER REMAINS UNPAID: PASS")

  const lock = await locks.findOne({ _id: id })

  assert.equal(lock.owner, owner)
  assert.equal(lock.expiresAt.getTime(), expiredAt.getTime())
  assert.ok(lock.ownershipChecks >= 1)

  console.log("ORIGINAL SYNTHETIC LOCK OWNERSHIP PRESERVED: PASS")

  await assert.rejects(
    coordinateV3RecoveryTestOnly({
      orderId,
      owner,
      expectedPaymentLinkId,
      inspectionArgs,
      inspect
    })
  )

  const afterReplay =
    await PaymentOperation.collection.findOne({ orderId: id })

  assert.equal(afterReplay.status, "completed")
  assert.equal(
    afterReplay.squarePaymentLinkId,
    expectedPaymentLinkId
  )

  console.log("DUPLICATE RECORDING REJECTED: PASS")

  console.log("NO REAL SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")
  console.log("ALL SYNTHETIC RECOVERY INTEGRATION TESTS PASSED")

} finally {
  if (connected) {
    try {
      if (
        mongoose.connection.db.databaseName === dbName &&
        insertedOrder
      ) {
        const locks = mongoose.connection.collection(
          "smart_shipping_v3_checkout_locks"
        )

        if (insertedLock) {
          await locks.deleteOne({
            _id: id,
            owner
          })
        }

        if (insertedOperation) {
          await PaymentOperation.collection.deleteOne({
            orderId: id,
            idempotencyKey
          })
        }

        await Order.collection.deleteOne({ _id: id })

        console.log("SYNTHETIC FIXTURES CLEANED")
      }
    } finally {
      await mongoose.disconnect()
    }
  }
}