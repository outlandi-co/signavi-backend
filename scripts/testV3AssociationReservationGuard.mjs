import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"

const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" }
})

try {
  await mongoose.connect(
    replica.getUri("signavi_reservation_isolated_test")
  )

  if (
    mongoose.connection.db.databaseName !==
    "signavi_reservation_isolated_test"
  ) {
    throw new Error("Unsafe database.")
  }

  const { default: Association } = await import(
    "../models/InvoiceOrderAssociationV3.js"
  )

  const { default: PaymentOperation } = await import(
    "../models/SmartShippingV3PaymentOperation.js"
  )

  const { acquireV3CheckoutLock } = await import(
    "../utils/smartShippingV3CheckoutLock.js"
  )

  const { reserveV3SquareRequest } = await import(
    "../utils/smartShippingV3ReserveSquareRequest.js"
  )

  await Association.init()

  const associatedOrderId = new mongoose.Types.ObjectId()
  const invoiceId = new mongoose.Types.ObjectId()

  await Association.create({
    invoiceId,
    orderId: associatedOrderId,
    environment: "sandbox",
    purchaseKey: `order:${associatedOrderId}`,
    amountCents: 15000
  })

  const associatedLock = await acquireV3CheckoutLock(
    String(associatedOrderId)
  )

  assert.ok(associatedLock)

  await assert.rejects(
    reserveV3SquareRequest({
      orderId: String(associatedOrderId),
      owner: associatedLock.owner
    }),
    /invoice association exists/
  )

  assert.equal(
    await Association.countDocuments({
      orderId: associatedOrderId
    }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({
      orderId: associatedOrderId
    }),
    0
  )

  console.log("EXISTING ASSOCIATION: RESERVATION BLOCKED")
  console.log("ASSOCIATION PRESERVED")
  console.log("NO PAYMENT OPERATION CREATED")

  const otherOrderId = new mongoose.Types.ObjectId()
  const otherLock = await acquireV3CheckoutLock(
    String(otherOrderId)
  )

  assert.ok(otherLock)

  await assert.rejects(
    reserveV3SquareRequest({
      orderId: String(otherOrderId),
      owner: otherLock.owner
    }),
    /V3 Square reservation rejected/
  )

  assert.equal(
    await PaymentOperation.countDocuments({
      orderId: otherOrderId
    }),
    0
  )

  console.log("MISSING ORDER/PAYMENT RECORDS: BLOCKED")
  console.log("UNASSOCIATED VALID CHECKOUT: NOT TESTED")
  console.log("SQUARE REQUESTS: NONE")
  console.log("V3 ASSOCIATION RESERVATION GUARD PASSED")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}