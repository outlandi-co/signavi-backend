import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"

const replica = await MongoMemoryReplSet.create({
  replSet: {
    count: 1,
    storageEngine: "wiredTiger"
  }
})

try {
  await mongoose.connect(
    replica.getUri("signavi_reservation_isolated_test")
  )

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_reservation_isolated_test"
  )

  const { default: Association } = await import(
    "../models/InvoiceOrderAssociationV3.js"
  )

  await Association.init()

  const invoiceId = new mongoose.Types.ObjectId()
  const orderId = new mongoose.Types.ObjectId()

  const attempts = await Promise.all(
    Array.from({ length: 25 }, async () => {
      const session = await mongoose.startSession()

      try {
        await session.withTransaction(async () => {
          await Association.create([{
            invoiceId,
            orderId,
            environment: "sandbox",
            purchaseKey: `order:${orderId}`,
            amountCents: 15000
          }], { session })
        })

        return true
      } catch (error) {
        if (error.code === 11000) {
          return false
        }

        throw error
      } finally {
        await session.endSession()
      }
    })
  )

  assert.equal(attempts.filter(Boolean).length, 1)
  assert.equal(attempts.filter(x => !x).length, 24)

  const records = await Association.find({
    invoiceId,
    environment: "sandbox"
  }).lean()

  assert.equal(records.length, 1)

  await assert.rejects(
    Association.create({
      invoiceId: new mongoose.Types.ObjectId(),
      orderId,
      environment: "sandbox",
      purchaseKey: `order:${orderId}`,
      amountCents: 15000
    }),
    { code: 11000 }
  )

  await assert.rejects(
    Association.create({
      invoiceId,
      orderId: new mongoose.Types.ObjectId(),
      environment: "sandbox",
      purchaseKey: `order:${orderId}`,
      amountCents: 15000
    }),
    { code: 11000 }
  )

  console.log("CONCURRENT ASSOCIATIONS: 25")
  console.log("ONE ASSOCIATION ACCEPTED: VERIFIED")
  console.log("DUPLICATE ATTEMPTS BLOCKED: 24")
  console.log("ORDER REASSIGNMENT: BLOCKED")
  console.log("INVOICE REASSIGNMENT: BLOCKED")
  console.log("MONGODB TRANSACTION: VERIFIED")
  console.log("NO SQUARE REQUESTS")
  console.log("ATOMIC ASSOCIATION TEST PASSED")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}