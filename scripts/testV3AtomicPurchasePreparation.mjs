import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")
process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")
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
  const { default: Purchase } = await import(
    "../models/SharedSquarePurchaseReservation.js"
  )
  const { default: Operation } = await import(
    "../models/SmartShippingV3PaymentOperation.js"
  )
  const { default: Association } = await import(
    "../models/InvoiceOrderAssociationV3.js"
  )
  const { acquireV3CheckoutLock } = await import(
    "../utils/smartShippingV3CheckoutLock.js"
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
  const { prepareV3AtomicPurchaseIsolated: prepare } =
    await import("../utils/prepareV3AtomicPurchaseIsolated.js")

  await Purchase.init()
  await Operation.init()
  await Association.init()

  const fixture = async ({ linked = false } = {}) => {
    const orderId = new mongoose.Types.ObjectId()
    const invoiceId = new mongoose.Types.ObjectId()

    await new Order({
      _id: orderId,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      customerName: "Atomic Test",
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

    const order = await Order.findById(orderId)

    if (linked) {
      await Invoice.collection.insertOne({
        _id: invoiceId,
        customerName: "Atomic Test",
        customerEmail: "customer@example.com",
        status: "draft",
        paymentStatus: "unpaid",
        total: 55.28,
        finalProof: { approved: false }
      })

      await Association.create({
        orderId,
        invoiceId,
        environment: "sandbox",
        purchaseKey: `order:${orderId}`,
        amountCents: 5528
      })
    }

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

    return {
      orderId,
      invoiceId,
      lock,
      guestToken,
      signedQuote
    }
  }

  const execute = (item, type, extras = {}) => prepare({
    lock: item.lock,
    documentType: type,
    documentId: type === "order"
      ? item.orderId
      : item.invoiceId,
    guestToken: item.guestToken,
    signedQuote: item.signedQuote,
    ...extras
  })

  const counts = async item => ({
    claims: await Purchase.countDocuments({
      purchaseKey: `order:${item.orderId}`,
      environment: "sandbox"
    }),
    operations: await Operation.countDocuments({
      orderId: item.orderId
    })
  })

  // Standalone order checkout.
  const order = await fixture()
  const result = await execute(order, "order")

  assert.equal(result.prepared, true)
  assert.equal(result.amountCents, 5528)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.paymentCreated, false)
  assert.deepEqual(await counts(order), {
    claims: 1,
    operations: 1
  })

  console.log("ATOMIC ORDER CLAIM + OPERATION: PASSED")

  await assert.rejects(
    execute(order, "order"),
    /Payment operation already exists|E11000/
  )

  assert.deepEqual(await counts(order), {
    claims: 1,
    operations: 1
  })

  console.log("DUPLICATE OPERATION: BLOCKED")

  // Associated invoice uses the same order-based identity.
  const invoice = await fixture({ linked: true })
  const invoiceResult = await execute(invoice, "invoice")

  assert.equal(invoiceResult.prepared, true)
  assert.equal(invoiceResult.amountCents, 5528)
  assert.deepEqual(await counts(invoice), {
    claims: 1,
    operations: 1
  })

  await assert.rejects(
    execute(invoice, "order"),
    /Invoice association owns purchase path/
  )

  console.log("INVOICE PURCHASE OWNERSHIP: PASSED")

  // A failed second write must roll back the purchase claim.
  const failed = await fixture()

  await assert.rejects(
    execute(failed, "order", {
      simulateFailureAfterClaim: true
    }),
    /SIMULATED_OPERATION_FAILURE/
  )

  assert.deepEqual(await counts(failed), {
    claims: 0,
    operations: 0
  })

  console.log("TRANSACTION ROLLBACK: PASSED")

  // No payment record can be created from an invalid quote.
  const invalid = await fixture()

  await assert.rejects(
    execute(invalid, "order", {
      signedQuote: invalid.signedQuote + "tampered"
    }),
    /Checkout authorization or quote invalid/
  )

  assert.deepEqual(await counts(invalid), {
    claims: 0,
    operations: 0
  })

  console.log("INVALID SIGNED QUOTE: BLOCKED")
  console.log("ATOMIC PURCHASE PREPARATION TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}