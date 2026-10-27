import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SHIPPING_QUOTE_SECRET = crypto.randomBytes(32).toString("hex")
process.env.SHIPPING_V3_QUOTE_SECRET = crypto.randomBytes(48).toString("hex")
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
  const { createGuestCheckoutToken } = await import(
    "../utils/guestCheckoutToken.js"
  )
  const { createV3OrderFingerprint } = await import(
    "../utils/smartShippingV3OrderFingerprint.js"
  )
  const { createV3SignedQuote } = await import(
    "../utils/smartShippingV3QuoteSigning.js"
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
    invoiceTotal = 55.28
  } = {}) => {
    const orderId = new mongoose.Types.ObjectId()
    const invoiceId = new mongoose.Types.ObjectId()

    // Match the existing V3 signed-checkout fixture.
    await new Order({
      _id: orderId,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      customerName: "Test Customer",
      email: "customer@example.com",
      address: {
        street: "123 Test Street",
        city: "Test City",
        state: "CA",
        zip: "90001",
        country: "US"
      },
      subtotal: 39.98,
      tax: 3.30,
      items: [{
        productId: new mongoose.Types.ObjectId(),
        quantity: 2,
        finalPrice: 19.99,
        variant: { color: "black", size: "L" }
      }]
    }).save()

    await Invoice.collection.insertOne({
      _id: invoiceId,
      customerName: "Test Customer",
      customerEmail: invoiceEmail,
      status: "draft",
      paymentStatus: "unpaid",
      total: invoiceTotal,
      finalProof: { approved: false }
    })

    const order = await Order.findById(orderId)
    assert.ok(order)

    const guestToken = createGuestCheckoutToken(order)

    const signedQuote = createV3SignedQuote({
      cartFingerprint: createV3OrderFingerprint(order),
      shippingAmountCents: 1200,
      parcelRateIds: ["test_rate_1", "test_rate_2"],
      carrier: "USPS",
      serviceToken: "usps_ground_advantage"
    })

    const lock = await acquireV3CheckoutLock(String(orderId))
    assert.ok(lock)

    return { orderId, invoiceId, lock, guestToken, signedQuote }
  }

  const invoke = (fixture, changes = {}) => link({
    lock: fixture.lock,
    invoiceId: fixture.invoiceId,
    guestToken: fixture.guestToken,
    signedQuote: fixture.signedQuote,
    ...changes
  })

  const countLinks = fixture =>
    Association.countDocuments({ orderId: fixture.orderId })

  // Valid credentials and matching invoice amount.
  const valid = await makeFixture()
  const result = await invoke(valid)

  assert.equal(result.linked, true)
  assert.equal(result.amountCents, 5528)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.paymentCreated, false)
  assert.equal(await countLinks(valid), 1)

  console.log("SIGNED CHECKOUT ASSOCIATION: PASSED")

  await assert.rejects(
    invoke(valid),
    error => error?.code === 11000
  )
  assert.equal(await countLinks(valid), 1)

  console.log("DUPLICATE ASSOCIATION: BLOCKED")

  const wrongGuest = await makeFixture()
  await assert.rejects(
    invoke(wrongGuest, { guestToken: "invalid-guest-token" }),
    /checkout authorization or quote invalid/
  )
  assert.equal(await countLinks(wrongGuest), 0)

  console.log("INVALID GUEST TOKEN: BLOCKED")

  const wrongQuote = await makeFixture()
  await assert.rejects(
    invoke(wrongQuote, {
      signedQuote: wrongQuote.signedQuote + "tampered"
    }),
    /checkout authorization or quote invalid/
  )
  assert.equal(await countLinks(wrongQuote), 0)

  console.log("TAMPERED SHIPPING QUOTE: BLOCKED")

  const wrongCustomer = await makeFixture({
    invoiceEmail: "wrong@example.com"
  })
  await assert.rejects(
    invoke(wrongCustomer),
    /customer_email_mismatch/
  )
  assert.equal(await countLinks(wrongCustomer), 0)

  console.log("CUSTOMER MISMATCH: BLOCKED")

  const wrongAmount = await makeFixture({ invoiceTotal: 56.28 })
  await assert.rejects(
    invoke(wrongAmount),
    /checkout_amount_mismatch/
  )
  assert.equal(await countLinks(wrongAmount), 0)

  console.log("AMOUNT MISMATCH: BLOCKED")

  const existingOperation = await makeFixture()
  await Operation.collection.insertOne({
    orderId: existingOperation.orderId,
    environment: "sandbox",
    status: "pending",
    amountCents: 5528,
    idempotencyKey: `signavi-v3-sandbox-${crypto.randomUUID()}`
  })
  await assert.rejects(
    invoke(existingOperation),
    /order_payment_operation_exists/
  )
  assert.equal(await countLinks(existingOperation), 0)

  console.log("EXISTING PAYMENT OPERATION: BLOCKED")

  const existingReservation = await makeFixture()
  await Reservation.collection.insertOne({
    documentType: "invoice",
    documentId: existingReservation.invoiceId,
    environment: "sandbox",
    amountCents: 5528,
    owner: "isolated-test-owner",
    idempotencyKey: `signavi-v3-sandbox-${crypto.randomUUID()}`,
    status: "reconciliation_required",
    attemptClaimedAt: null
  })
  await assert.rejects(
    invoke(existingReservation),
    /invoice_payment_reservation_exists/
  )
  assert.equal(await countLinks(existingReservation), 0)

  console.log("EXISTING INVOICE RESERVATION: BLOCKED")
  console.log("TRUSTED LINKING INTEGRATION TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}