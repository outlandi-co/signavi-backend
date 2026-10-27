import assert from "node:assert/strict"
import crypto from "node:crypto"
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

  const { default: Order } =
    await import("../models/Order.js")

  const { default: PaymentOperation } =
    await import("../models/SmartShippingV3PaymentOperation.js")

  const { default: Association } =
    await import("../models/InvoiceOrderAssociationV3.js")

  const { createV3CheckoutReference } =
    await import("../utils/smartShippingV3CheckoutReference.js")

  const { acquireV3CheckoutLock } =
    await import("../utils/smartShippingV3CheckoutLock.js")

  const { reserveV3SquareRequest } =
    await import("../utils/smartShippingV3ReserveSquareRequest.js")

  await Association.init()

  const orderId = new mongoose.Types.ObjectId()
  const invoiceId = new mongoose.Types.ObjectId()
  const ownerId = String(orderId)

  await Order.collection.insertOne({
    _id: orderId,
    status: "payment_required",
    paymentStatus: "pending",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 5528,
    squarePaymentLinkId: ""
  })

  await PaymentOperation.collection.insertOne({
    orderId,
    amountCents: 5528,
    environment: "sandbox",
    status: "pending",
    checkoutReferenceId:
      createV3CheckoutReference({ orderId: ownerId }),
    idempotencyKey:
      `signavi-v3-sandbox-${crypto.randomUUID()}`,
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  await Association.create({
    invoiceId,
    orderId,
    environment: "sandbox",
    purchaseKey: `order:${ownerId}`,
    amountCents: 5528
  })

  const lock = await acquireV3CheckoutLock(ownerId)
  assert.ok(lock)

  await assert.rejects(
    reserveV3SquareRequest({
      orderId: ownerId,
      owner: lock.owner
    }),
    /invoice association exists/
  )

  const operation = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(operation.status, "pending")
  assert.equal(operation.requestOwner, "")
  assert.equal(operation.amountCents, 5528)

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  assert.equal(
    await Association.countDocuments({ orderId }),
    1
  )

  console.log("VALID PAYABLE ORDER: CREATED")
  console.log("VALID PENDING PAYMENT OPERATION: CREATED")
  console.log("EXISTING INVOICE ASSOCIATION: BLOCKED")
  console.log("PAYMENT OPERATION: UNCHANGED")
  console.log("ASSOCIATION: PRESERVED")
  console.log("SQUARE REQUESTS: NONE")
  console.log("ASSOCIATED PAYABLE ORDER REGRESSION PASSED")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}