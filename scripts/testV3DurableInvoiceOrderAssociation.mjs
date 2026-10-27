import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
delete process.env.MONGO_URI

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
    "../models/SmartShippingV3InvoiceOrderAssociation.js"
  )

  await Association.init()

  const orderId = new mongoose.Types.ObjectId()
  const invoiceId = new mongoose.Types.ObjectId()

  const original = await Association.create({
    environment: "sandbox",
    invoiceId,
    orderId,
    purchaseKey: `order:${orderId}`,
    amountCents: 5528
  })

  assert.ok(original._id)

  const duplicateInvoiceOrderId = new mongoose.Types.ObjectId()

  await assert.rejects(
    Association.create({
      environment: "sandbox",
      invoiceId,
      orderId: duplicateInvoiceOrderId,
      purchaseKey: `order:${duplicateInvoiceOrderId}`,
      amountCents: 5528
    }),
    error => error?.code === 11000
  )

  console.log("DUPLICATE INVOICE ASSOCIATION: BLOCKED")

  await assert.rejects(
    Association.create({
      environment: "sandbox",
      invoiceId: new mongoose.Types.ObjectId(),
      orderId,
      purchaseKey: `order:${orderId}`,
      amountCents: 5528
    }),
    error => error?.code === 11000
  )

  console.log("DUPLICATE ORDER ASSOCIATION: BLOCKED")

  const otherOrder = new mongoose.Types.ObjectId()

  await assert.rejects(
    Association.create({
      environment: "sandbox",
      invoiceId: new mongoose.Types.ObjectId(),
      orderId: otherOrder,
      purchaseKey: `order:${orderId}`,
      amountCents: 5528
    }),
    error =>
      error?.name === "ValidationError" &&
      Boolean(error?.errors?.purchaseKey)
  )

  console.log("MISMATCHED PURCHASE IDENTITY: BLOCKED")

  const productionOrderId = new mongoose.Types.ObjectId()

  await assert.rejects(
    Association.create({
      environment: "production",
      invoiceId: new mongoose.Types.ObjectId(),
      orderId: productionOrderId,
      purchaseKey: `order:${productionOrderId}`,
      amountCents: 5528
    }),
    error =>
      error?.name === "ValidationError" &&
      Boolean(error?.errors?.environment)
  )

  console.log("PRODUCTION ASSOCIATION: BLOCKED")

  assert.equal(await Association.countDocuments(), 1)

  console.log("DURABLE INVOICE/ORDER ASSOCIATION TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}