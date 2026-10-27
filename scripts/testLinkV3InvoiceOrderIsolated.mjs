import assert from "node:assert/strict"
import crypto from "node:crypto"
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

  const { default: Order } = await import("../models/Order.js")
  const { default: Invoice } = await import("../models/Invoice.js")
  const { default: Operation } = await import(
    "../models/SmartShippingV3PaymentOperation.js"
  )
  const { default: Reservation } = await import(
    "../models/SharedSquarePaymentReservation.js"
  )
  const { default: Association } = await import(
    "../models/InvoiceOrderAssociationV3.js"
  )
  const { acquireV3CheckoutLock } = await import(
    "../utils/smartShippingV3CheckoutLock.js"
  )
  const { linkV3InvoiceOrderIsolated: link } = await import(
    "../utils/linkV3InvoiceOrderIsolated.js"
  )

  await Association.init()

  const makeFixture = async ({
    invoiceEmail = "customer@example.com",
    invoiceTotal = 150
  } = {}) => {
    const orderId = new mongoose.Types.ObjectId()
    const invoiceId = new mongoose.Types.ObjectId()

    // Raw inserts avoid unrelated schema hooks.
    await Order.collection.insertOne({
      _id: orderId,
      customerName: "Test Customer",
      email: "customer@example.com",
      source: "store",
      status: "pending",
      paymentStatus: "unpaid",
      currency: "usd",
      subtotal: 120,
      tax: 10,
      squareEnvironment: null,
      squarePaymentLinkId: ""
    })

    await Invoice.collection.insertOne({
      _id: invoiceId,
      customerName: "Test Customer",
      customerEmail: invoiceEmail,
      status: "draft",
      paymentStatus: "unpaid",
      total: invoiceTotal,
      finalProof: { approved: false }
    })

    const lock = await acquireV3CheckoutLock(
      String(orderId)
    )

    assert.ok(lock)

    return {
      orderId,
      invoiceId,
      lock,
      prepared: {
        orderId: String(orderId),
        subtotalCents: 12000,
        taxCents: 1000,
        shippingAmountCents: 2000,
        totalCents: 15000
      }
    }
  }

  const invoke = fixture => link({
    lock: fixture.lock,
    invoiceId: fixture.invoiceId,
    prepared: fixture.prepared
  })

  // TEST 1: Successful isolated association.
  const valid = await makeFixture()
  const linked = await invoke(valid)

  assert.equal(linked.linked, true)
  assert.equal(linked.amountCents, 15000)
  assert.equal(linked.squareRequestAuthorized, false)
  assert.equal(linked.paymentCreated, false)

  assert.equal(
    await Association.countDocuments({
      invoiceId: valid.invoiceId,
      orderId: valid.orderId
    }),
    1
  )

  console.log("VALID INVOICE/ORDER: LINKED")

  // TEST 2: Duplicate association must not succeed.
  await assert.rejects(
    invoke(valid),
    error => error?.code === 11000
  )

  assert.equal(
    await Association.countDocuments({
      orderId: valid.orderId
    }),
    1
  )

  console.log("DUPLICATE ASSOCIATION: BLOCKED")

  // TEST 3: Different customer email.
  const wrongCustomer = await makeFixture({
    invoiceEmail: "wrong@example.com"
  })

  await assert.rejects(
    invoke(wrongCustomer),
    /customer_email_mismatch/
  )

  assert.equal(
    await Association.countDocuments({
      orderId: wrongCustomer.orderId
    }),
    0
  )

  console.log("CUSTOMER MISMATCH: BLOCKED")

  // TEST 4: Different payment amount.
  const wrongAmount = await makeFixture({
    invoiceTotal: 151
  })

  await assert.rejects(
    invoke(wrongAmount),
    /checkout_amount_mismatch/
  )

  assert.equal(
    await Association.countDocuments({
      orderId: wrongAmount.orderId
    }),
    0
  )

  console.log("AMOUNT MISMATCH: BLOCKED")

  // TEST 5: Existing pending payment operation.
  const existingOperation = await makeFixture()

  await Operation.collection.insertOne({
    orderId: existingOperation.orderId,
    environment: "sandbox",
    status: "pending",
    amountCents: 15000,
    idempotencyKey:
      `signavi-v3-sandbox-${crypto.randomUUID()}`
  })

  await assert.rejects(
    invoke(existingOperation),
    /order_payment_operation_exists/
  )

  assert.equal(
    await Association.countDocuments({
      orderId: existingOperation.orderId
    }),
    0
  )

  console.log("EXISTING PAYMENT OPERATION: BLOCKED")

  // TEST 6: Existing invoice payment reservation.
  const existingReservation = await makeFixture()

  await Reservation.collection.insertOne({
    documentType: "invoice",
    documentId: existingReservation.invoiceId,
    environment: "sandbox",
    amountCents: 15000,
    owner: "isolated-test-owner",
    idempotencyKey:
      `signavi-v3-sandbox-${crypto.randomUUID()}`,
    status: "reconciliation_required",
    attemptClaimedAt: null
  })

  await assert.rejects(
    invoke(existingReservation),
    /invoice_payment_reservation_exists/
  )

  assert.equal(
    await Association.countDocuments({
      orderId: existingReservation.orderId
    }),
    0
  )

  console.log("EXISTING INVOICE RESERVATION: BLOCKED")

  console.log("TRANSACTIONAL ASSOCIATION: VERIFIED")
  console.log("ISOLATED DATABASE: VERIFIED")
  console.log("SQUARE REQUESTS: NONE")
  console.log("LINKING INTEGRATION TEST PASSED")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}