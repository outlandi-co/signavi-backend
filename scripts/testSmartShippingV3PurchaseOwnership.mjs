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

  const { default: Ownership } = await import(
    "../models/SmartShippingV3PurchaseOwnership.js"
  )

  await Ownership.init()

  const orderId = new mongoose.Types.ObjectId()
  const invoiceId = new mongoose.Types.ObjectId()
  const purchaseKey = `order:${orderId}`

  const attempts = Array.from({ length: 50 }, (_, index) => {
    const type = index % 2 === 0 ? "order" : "invoice"

    return Ownership.create({
      environment: "sandbox",
      purchaseKey,
      claimedByDocumentType: type,
      claimedByDocumentId:
        type === "order" ? orderId : invoiceId,
      status: "reconciliation_required"
    })
  })

  const settled = await Promise.allSettled(attempts)

  const fulfilled = settled.filter(
    result => result.status === "fulfilled"
  )

  const rejected = settled.filter(
    result => result.status === "rejected"
  )

  assert.equal(fulfilled.length, 1)
  assert.equal(rejected.length, 49)

  assert.ok(
    rejected.every(
      result => result.reason?.code === 11000
    )
  )

  const records = await Ownership.find({
    environment: "sandbox",
    purchaseKey
  }).lean()

  assert.equal(records.length, 1)

  const winner = records[0]

  assert.ok(
    ["order", "invoice"].includes(
      winner.claimedByDocumentType
    )
  )

  assert.equal(
    String(winner.claimedByDocumentId),
    winner.claimedByDocumentType === "order"
      ? String(orderId)
      : String(invoiceId)
  )

  assert.equal(
    winner.status,
    "reconciliation_required"
  )

  // Different purchase identities must remain independent.
  const secondOrderId = new mongoose.Types.ObjectId()

  await Ownership.create({
    environment: "sandbox",
    purchaseKey: `order:${secondOrderId}`,
    claimedByDocumentType: "order",
    claimedByDocumentId: secondOrderId
  })

  assert.equal(
    await Ownership.countDocuments(),
    2
  )

  // Production ownership is intentionally unsupported.
  await assert.rejects(
    Ownership.create({
      environment: "production",
      purchaseKey: `order:${new mongoose.Types.ObjectId()}`,
      claimedByDocumentType: "order",
      claimedByDocumentId: new mongoose.Types.ObjectId()
    }),
    /validation failed|not a valid enum/i
  )

  assert.equal(
    await Ownership.countDocuments(),
    2
  )

  console.log("CANONICAL PURCHASE KEY UNIQUE: PASSED")
  console.log("50 SHARED PURCHASE CLAIMS: 1 WON, 49 BLOCKED")
  console.log("SECOND PURCHASE INDEPENDENT: PASSED")
  console.log("PRODUCTION OWNERSHIP CREATION: BLOCKED")
  console.log("DURABLE SANDBOX OWNERSHIP MODEL TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}