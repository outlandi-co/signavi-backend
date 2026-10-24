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

const databaseName = "signavi_shipping_v3_dev"
const uri = process.env.MONGO_URI

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !uri
) {
  throw new Error(
    "STOP: Requires development/test, Square Sandbox and MONGO_URI."
  )
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3CheckoutReference({ orderId })
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`

let connected = false
let lock = null

try {
  await mongoose.connect(uri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(
    mongoose.connection.db.databaseName,
    databaseName,
    "STOP: Unexpected database."
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
  assert.ok(lock?.owner, "Failed to acquire test checkout lock.")

  await assert.rejects(
    reserveV3SquareRequest({
      orderId,
      owner: "wrong-owner"
    })
  )

  console.log("WRONG OWNER BLOCKED: PASS")

  await PaymentOperation.collection.updateOne(
    { orderId: id },
    { $set: { amountCents: 5529 } }
  )

  await assert.rejects(
    reserveV3SquareRequest({
      orderId,
      owner: lock.owner
    }),
    /payment_amount_mismatch/
  )

  console.log("TAMPERED AMOUNT BLOCKED: PASS")

  await PaymentOperation.collection.updateOne(
    { orderId: id },
    { $set: { amountCents: 5528 } }
  )

  const results = await Promise.allSettled([
    reserveV3SquareRequest({
      orderId,
      owner: lock.owner
    }),
    reserveV3SquareRequest({
      orderId,
      owner: lock.owner
    })
  ])

  const successes = results.filter(
    result => result.status === "fulfilled"
  )

  const failures = results.filter(
    result => result.status === "rejected"
  )

  assert.equal(
    successes.length,
    1,
    "Exactly one concurrent reservation must succeed."
  )

  assert.equal(
    failures.length,
    1,
    "Concurrent duplicate must be rejected."
  )

  const reserved = successes[0].value

  assert.equal(reserved.requestReserved, true)
  assert.equal(reserved.amountCents, 5528)
  assert.equal(reserved.checkoutReferenceId, reference)
  assert.equal(reserved.idempotencyKey, key)
  assert.equal(reserved.squareRequestAuthorized, false)
  assert.equal(reserved.paymentCreated, false)

  console.log("ONE CONCURRENT RESERVATION: PASS")
  console.log("DUPLICATE CONCURRENT ATTEMPT BLOCKED: PASS")

  const operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "reconciliation_required")
  assert.equal(operation.requestOwner, lock.owner)
  assert.equal(operation.amountCents, 5528)
  assert.equal(operation.idempotencyKey, key)
  assert.equal(operation.squarePaymentLinkId, "")
  assert.equal(operation.squareOrderId, "")
  assert.equal(operation.paymentUrl, "")

  console.log("PERSISTED REQUEST OWNERSHIP: PASS")
  console.log("NO SQUARE PAYMENT LINK CREATED: PASS")

  await assert.rejects(
    reserveV3SquareRequest({
      orderId,
      owner: lock.owner
    })
  )

  console.log("SEQUENTIAL DUPLICATE BLOCKED: PASS")
  console.log("NO SQUARE AUTHORIZATION: PASS")
  console.log("ALL ATOMIC RESERVATION TESTS PASSED")

} finally {
  if (connected) {
    try {
      if (
        mongoose.connection.db.databaseName === databaseName
      ) {
        // Remove only this run's randomly generated records.
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