import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import { acquireV3CheckoutLock } from "../utils/smartShippingV3CheckoutLock.js"
import { createV3CheckoutReference } from "../utils/smartShippingV3CheckoutReference.js"
import { reserveV3SquareRequest } from "../utils/smartShippingV3ReserveSquareRequest.js"
import { markV3PaymentCompleted } from "../utils/smartShippingV3PaymentState.js"
import { verifyAndRecordV3SquareLink } from "../utils/smartShippingV3VerifiedLinkRecording.js"

const dbName = "signavi_shipping_v3_dev"

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI
) {
  throw new Error("STOP: Development/test, Sandbox and MONGO_URI required.")
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3CheckoutReference({ orderId })
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`
const linkId = "mock-square-link-" + orderId.slice(-8)
const squareOrderId = "mock-square-order-" + orderId.slice(-8)
const locationId = "mock-sandbox-location"

let connected = false
let lock = null
let createCalls = 0
let recordCalls = 0

const makeClient = ({ wrongAmount = false, failLookup = false } = {}) => ({
  checkout: {
    paymentLinks: {
      get: async () => {
        if (failLookup) throw new Error("Simulated Square lookup timeout")
        return {
          paymentLink: {
            id: linkId,
            orderId: squareOrderId,
            url: "https://square.link/u/mock"
          }
        }
      },
      create: async () => {
        createCalls++
        throw new Error("FORBIDDEN: Square creation")
      }
    }
  },
  orders: {
    get: async () => ({
      order: {
        id: squareOrderId,
        referenceId: reference,
        locationId,
        totalMoney: {
          amount: wrongAmount ? 5529n : 5528n,
          currency: "USD"
        }
      }
    })
  }
})

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
  assert.equal(reservation.squareRequestAuthorized, false)

  const recordVerifiedLink = async data => {
    recordCalls++
    return markV3PaymentCompleted({
      orderId,
      owner: lock.owner,
      amountCents: reservation.amountCents,
      idempotencyKey: reservation.idempotencyKey,
      ...data
    })
  }

  const verify = (client) => verifyAndRecordV3SquareLink({
    client,
    expectedPaymentLinkId: linkId,
    expectedAmountCents: reservation.amountCents,
    expectedReferenceId: reservation.checkoutReferenceId,
    expectedLocationId: locationId,
    recordVerifiedLink
  })

  await assert.rejects(
    verify(makeClient({ wrongAmount: true }))
  )
  assert.equal(recordCalls, 0)

  let operation = await PaymentOperation.collection.findOne({ orderId: id })
  assert.equal(operation.status, "reconciliation_required")
  console.log("WRONG AMOUNT CANNOT RECORD: PASS")

  await assert.rejects(
    verify(makeClient({ failLookup: true })),
    /Simulated Square lookup timeout/
  )
  assert.equal(recordCalls, 0)

  operation = await PaymentOperation.collection.findOne({ orderId: id })
  assert.equal(operation.status, "reconciliation_required")
  assert.equal(operation.squarePaymentLinkId, "")
  console.log("UNCERTAIN LOOKUP PRESERVES RECONCILIATION: PASS")

  const recorded = await verify(makeClient())
  assert.equal(recorded.paymentLinkRecorded, true)
  assert.equal(recorded.customerPaymentConfirmed, false)

  operation = await PaymentOperation.collection.findOne({ orderId: id })
  assert.equal(operation.status, "completed")
  assert.equal(operation.squarePaymentLinkId, linkId)
  assert.equal(operation.squareOrderId, squareOrderId)
  assert.equal(operation.paymentUrl, "https://square.link/u/mock")
  console.log("VERIFIED LINK RECORDED IN MONGODB: PASS")

  await assert.rejects(verify(makeClient()))
  assert.equal(recordCalls, 2)

  operation = await PaymentOperation.collection.findOne({ orderId: id })
  assert.equal(operation.status, "completed")
  assert.equal(operation.squarePaymentLinkId, linkId)
  console.log("DUPLICATE RECORDING REJECTED: PASS")

  const order = await Order.collection.findOne({ _id: id })
  assert.notEqual(String(order.paymentStatus).toLowerCase(), "paid")
  assert.equal(createCalls, 0)

  console.log("ORDER NOT MARKED PAID: PASS")
  console.log("ZERO SQUARE CREATION CALLS: PASS")
  console.log("ALL VERIFIED RECORDING MONGODB TESTS PASSED")

} finally {
  if (connected) {
    try {
      if (mongoose.connection.db.databaseName === dbName) {
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
        console.log("ISOLATED TEST FIXTURES CLEANED")
      }
    } finally {
      await mongoose.disconnect()
    }
  }
}