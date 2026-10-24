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
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  reserveV3SquareRequest
} from "../utils/smartShippingV3ReserveSquareRequest.js"

import {
  coordinateV3VerifiedSandboxReservation
} from "../utils/smartShippingV3VerifiedSandboxReservation.js"

const databaseName = "signavi_shipping_v3_dev"

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI
) {
  throw new Error(
    "STOP: Development/test, Square Sandbox and MONGO_URI required."
  )
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3CheckoutReference({ orderId })
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`

let connected = false
let lock = null
let identityCalls = 0

const goodIdentity = async () => {
  identityCalls++
  return {
    verified: true,
    merchantId: "mock-merchant",
    locationId: "mock-location",
    squareRequestAuthorized: false
  }
}

const coordinate = (verifyIdentity, owner) =>
  coordinateV3VerifiedSandboxReservation({
    expectedMerchantId: "mock-merchant",
    expectedLocationId: "mock-location",
    verifyIdentity,
    reserve: () => reserveV3SquareRequest({
      orderId,
      owner
    })
  })

try {
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

  await assert.rejects(
    coordinate(async () => ({
      verified: false,
      squareRequestAuthorized: false
    }), lock.owner),
    /verification failed/
  )

  let operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "pending")
  assert.equal(operation.requestOwner, "")
  console.log("REJECTED IDENTITY LEAVES PAYMENT PENDING: PASS")

  await assert.rejects(
    coordinate(goodIdentity, "wrong-owner")
  )

  operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "pending")
  assert.equal(operation.requestOwner, "")
  console.log("WRONG OWNER CANNOT RESERVE: PASS")

  const result = await coordinate(goodIdentity, lock.owner)

  assert.equal(result.requestReserved, true)
  assert.equal(result.merchantIdentityVerified, true)
  assert.equal(result.amountCents, 5528)
  assert.equal(result.checkoutReferenceId, reference)
  assert.equal(result.idempotencyKey, key)
  assert.equal(result.locationId, "mock-location")
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.paymentCreated, false)

  operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "reconciliation_required")
  assert.equal(operation.requestOwner, lock.owner)
  assert.equal(operation.squarePaymentLinkId, "")
  assert.equal(operation.squareOrderId, "")
  assert.equal(operation.paymentUrl, "")

  console.log("VERIFIED IDENTITY + MONGODB RESERVATION: PASS")
  console.log("PERSISTED PAYMENT OWNERSHIP: PASS")

  await assert.rejects(
    coordinate(goodIdentity, lock.owner)
  )

  operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "reconciliation_required")
  assert.equal(operation.requestOwner, lock.owner)

  console.log("DUPLICATE RESERVATION BLOCKED: PASS")
  assert.equal(identityCalls, 3)
  console.log("MOCK IDENTITY CALL COUNT: PASS")
  console.log("NO PAYMENT-LINK CREATION: PASS")
  console.log("ALL VERIFIED RESERVATION MONGODB TESTS PASSED")

} finally {
  if (connected) {
    try {
      if (mongoose.connection.db.databaseName === databaseName) {
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
      await mongoose.disconnect()
    }
  }
}