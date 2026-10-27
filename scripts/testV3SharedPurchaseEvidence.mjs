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

  const { default: Association } = await import(
    "../models/InvoiceOrderAssociationV3.js"
  )
  const { default: Operation } = await import(
    "../models/SmartShippingV3PaymentOperation.js"
  )
  const { default: Reservation } = await import(
    "../models/SharedSquarePaymentReservation.js"
  )
  const { default: Purchase } = await import(
    "../models/SharedSquarePurchaseReservation.js"
  )
  const { claimV3SharedPurchaseIsolated: claim } = await import(
    "../utils/claimV3SharedPurchaseIsolated.js"
  )

  await Association.init()
  await Purchase.init()

  const fixture = async () => {
    const orderId = new mongoose.Types.ObjectId()
    const invoiceId = new mongoose.Types.ObjectId()

    await Association.create({
      orderId,
      invoiceId,
      environment: "sandbox",
      purchaseKey: `order:${orderId}`,
      amountCents: 5528
    })

    return { orderId, invoiceId }
  }

  const attempt = (pair, type) => claim({
    orderId: pair.orderId,
    documentType: type,
    documentId: type === "order"
      ? pair.orderId
      : pair.invoiceId
  })

  const noClaim = async pair => {
    assert.equal(
      await Purchase.countDocuments({
        environment: "sandbox",
        purchaseKey: `order:${pair.orderId}`
      }),
      0
    )
  }

  const operation = await fixture()

  await Operation.collection.insertOne({
    orderId: operation.orderId,
    environment: "sandbox",
    status: "pending",
    amountCents: 5528
  })

  for (const type of ["order", "invoice"]) {
    const result = await attempt(operation, type)
    assert.equal(result.claimed, false)
    assert.equal(
      result.reason,
      "order_payment_operation_exists"
    )
  }

  await noClaim(operation)
  console.log("EXISTING ORDER PAYMENT OPERATION: BLOCKED BOTH PATHS")

  const orderReservation = await fixture()

  await Reservation.collection.insertOne({
    documentType: "order",
    documentId: orderReservation.orderId,
    environment: "sandbox",
    amountCents: 5528,
    owner: "test-owner-order",
    idempotencyKey: `test-order-${orderReservation.orderId}`
  })

  for (const type of ["order", "invoice"]) {
    const result = await attempt(orderReservation, type)
    assert.equal(result.claimed, false)
    assert.equal(
      result.reason,
      "document_payment_reservation_exists"
    )
  }

  await noClaim(orderReservation)
  console.log("EXISTING ORDER RESERVATION: BLOCKED BOTH PATHS")

  const invoiceReservation = await fixture()

  await Reservation.collection.insertOne({
    documentType: "invoice",
    documentId: invoiceReservation.invoiceId,
    environment: "sandbox",
    amountCents: 5528,
    owner: "test-owner-invoice",
    idempotencyKey: `test-invoice-${invoiceReservation.invoiceId}`
  })

  for (const type of ["order", "invoice"]) {
    const result = await attempt(invoiceReservation, type)
    assert.equal(result.claimed, false)
    assert.equal(
      result.reason,
      "document_payment_reservation_exists"
    )
  }

  await noClaim(invoiceReservation)
  console.log("EXISTING INVOICE RESERVATION: BLOCKED BOTH PATHS")

  console.log("SHARED PURCHASE PAYMENT EVIDENCE TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}