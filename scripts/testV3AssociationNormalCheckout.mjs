import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"

// Never use an externally configured database.
delete process.env.MONGO_URI

const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" }
})

try {
  await mongoose.connect(
    replica.getUri("signavi_reservation_isolated_test")
  )

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_reservation_isolated_test"
  )

  const { default: Order } = await import("../models/Order.js")
  const { default: PaymentOperation } = await import(
    "../models/SmartShippingV3PaymentOperation.js"
  )
  const { acquireV3CheckoutLock } = await import(
    "../utils/smartShippingV3CheckoutLock.js"
  )
  const { createV3CheckoutReference } = await import(
    "../utils/smartShippingV3CheckoutReference.js"
  )
  const { reserveV3SquareRequest } = await import(
    "../utils/smartShippingV3ReserveSquareRequest.js"
  )

  const id = new mongoose.Types.ObjectId()
  const orderId = String(id)

  // Raw inserts intentionally match the existing
  // V3 reservation fixture without triggering Order hooks.
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
    checkoutReferenceId:
      createV3CheckoutReference({ orderId }),
    idempotencyKey:
      `signavi-v3-sandbox-${crypto.randomUUID()}`,
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  const lock = await acquireV3CheckoutLock(orderId)
  assert.ok(lock)

  const reserved = await reserveV3SquareRequest({
    orderId,
    owner: lock.owner
  })

  assert.equal(reserved.requestReserved, true)
  assert.equal(reserved.squareRequestAuthorized, false)
  assert.equal(reserved.paymentCreated, false)
  assert.equal(reserved.amountCents, 5528)

  const stored = await PaymentOperation.findOne({
    orderId: id
  }).lean()

  assert.equal(
    stored.status,
    "reconciliation_required"
  )

  assert.equal(stored.requestOwner, lock.owner)

  console.log("UNASSOCIATED CHECKOUT: RESERVED")
  console.log("PAYMENT OPERATION: RECONCILIATION REQUIRED")
  console.log("SQUARE AUTHORIZATION: DISABLED")

  await assert.rejects(
    reserveV3SquareRequest({
      orderId,
      owner: lock.owner
    }),
    /V3 Square reservation rejected/
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: id }),
    1
  )

  console.log("REPEATED RESERVATION: BLOCKED")
  console.log("PAYMENT RECORDS: EXACTLY ONE")
  console.log("NO SQUARE REQUESTS")
  console.log("NORMAL CHECKOUT REGRESSION PASSED")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}