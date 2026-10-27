import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
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

  const { default: Purchase } = await import(
    "../models/SharedSquarePurchaseReservation.js"
  )
  const { default: Association } = await import(
    "../models/InvoiceOrderAssociationV3.js"
  )
  const { acquireV3CheckoutLock } = await import(
    "../utils/smartShippingV3CheckoutLock.js"
  )
  const { claimV3OwnedPurchaseIsolated: claim } = await import(
    "../utils/claimV3OwnedPurchaseIsolated.js"
  )

  await Purchase.init()
  await Association.init()

  const orderId = new mongoose.Types.ObjectId()
  const invoiceId = new mongoose.Types.ObjectId()

  await Association.create({
    orderId,
    invoiceId,
    environment: "sandbox",
    purchaseKey: `order:${orderId}`,
    amountCents: 5528
  })

  const lock = await acquireV3CheckoutLock(String(orderId))
  assert.ok(lock)

  await assert.rejects(
    claim({
      lock: {
        orderId: String(orderId),
        owner: "not-the-owner"
      },
      documentType: "invoice",
      documentId: invoiceId
    })
  )

  assert.equal(await Purchase.countDocuments(), 0)
  console.log("WRONG LOCK OWNER: BLOCKED")

  const result = await claim({
    lock,
    documentType: "invoice",
    documentId: invoiceId
  })

  assert.equal(result.claimed, true)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.paymentCreated, false)

  assert.equal(await Purchase.countDocuments(), 1)
  console.log("OWNED INVOICE PURCHASE CLAIM: PASSED")

  await assert.rejects(
    claim({
      lock,
      documentType: "order",
      documentId: orderId
    }),
    error => error?.code === 11000
  )

  assert.equal(await Purchase.countDocuments(), 1)
  console.log("COMPETING ORDER CLAIM: BLOCKED")

  console.log("OWNED PURCHASE CLAIM REGRESSION PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}