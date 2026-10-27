import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

process.env.NODE_ENV = "test"

const mongo = await MongoMemoryServer.create()

try {
  await mongoose.connect(
    mongo.getUri("signavi_reservation_isolated_test")
  )

  const { default: Reservation } = await import(
    "../models/SharedSquarePurchaseReservation.js"
  )

  await Reservation.init()

  const orderId = new mongoose.Types.ObjectId()
  const linkedInvoiceId = new mongoose.Types.ObjectId()
  const standaloneInvoiceId = new mongoose.Types.ObjectId()

  // These keys are fixtures representing identities
  // already verified by trusted server-side logic.
  const sharedPurchaseKey = `order:${orderId}`
  const standaloneKey = `invoice:${standaloneInvoiceId}`

  const attempts = await Promise.allSettled(
    Array.from({ length: 50 }, (_, index) =>
      Reservation.create({
        environment: "sandbox",
        purchaseKey: sharedPurchaseKey,
        claimedByDocumentType:
          index % 2 === 0 ? "order" : "invoice",
        claimedByDocumentId:
          index % 2 === 0 ? orderId : linkedInvoiceId
      })
    )
  )

  const accepted = attempts.filter(
    result => result.status === "fulfilled"
  )

  const rejected = attempts.filter(
    result => result.status === "rejected"
  )

  assert.equal(accepted.length, 1)
  assert.equal(rejected.length, 49)

  assert.ok(
    rejected.every(result => result.reason?.code === 11000)
  )

  const sharedRecords = await Reservation.find({
    environment: "sandbox",
    purchaseKey: sharedPurchaseKey
  }).lean()

  assert.equal(sharedRecords.length, 1)
  assert.equal(
    sharedRecords[0].status,
    "reconciliation_required"
  )

  const standalone = await Reservation.create({
    environment: "sandbox",
    purchaseKey: standaloneKey,
    claimedByDocumentType: "invoice",
    claimedByDocumentId: standaloneInvoiceId
  })

  assert.ok(standalone._id)

  const total = await Reservation.countDocuments()

  assert.equal(total, 2)

  console.log("LINKED ORDER/INVOICE: 1 RESERVED, 49 BLOCKED")
  console.log("STANDALONE INVOICE: INDEPENDENT")
  console.log("PURCHASE-LEVEL UNIQUE INDEX: VERIFIED")
  console.log("SQUARE EXECUTION: NOT INVOKED")
  console.log("SHARED PURCHASE RESERVATION TEST PASSED")
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}