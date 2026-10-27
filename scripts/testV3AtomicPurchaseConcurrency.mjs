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

  const compete = async (type, linked) => {
    const item = await fixture({ linked })
    const attempts = 50

    const settled = await Promise.allSettled(
      Array.from({ length: attempts }, () =>
        execute(item, type)
      )
    )

    const successful = settled.filter(
      result => result.status === "fulfilled"
    )

    const rejected = settled.filter(
      result => result.status === "rejected"
    )

    assert.equal(
      successful.length,
      1,
      `${type}: expected exactly one successful preparation`
    )

    assert.equal(
      rejected.length,
      attempts - 1,
      `${type}: expected 49 blocked attempts`
    )

    const winner = successful[0].value

    assert.equal(winner.prepared, true)
    assert.equal(winner.amountCents, 5528)
    assert.equal(winner.squareRequestAuthorized, false)
    assert.equal(winner.paymentCreated, false)

    assert.deepEqual(await counts(item), {
      claims: 1,
      operations: 1
    })

    const purchase = await Purchase.findOne({
      environment: "sandbox",
      purchaseKey: `order:${item.orderId}`
    }).lean()

    assert.ok(purchase)
    assert.equal(purchase.claimedByDocumentType, type)
    assert.equal(
      String(purchase.claimedByDocumentId),
      String(type === "order" ? item.orderId : item.invoiceId)
    )

    const operation = await Operation.findOne({
      orderId: item.orderId
    }).lean()

    assert.ok(operation)
    assert.equal(operation.status, "pending")
    assert.equal(operation.amountCents, 5528)
    assert.match(
      operation.idempotencyKey,
      /^signavi-v3-sandbox-/
    )

    console.log(
      `${type.toUpperCase()}: 1 SUCCESS, 49 BLOCKED`
    )
    console.log(
      `${type.toUpperCase()}: ONE CLAIM + ONE OPERATION`
    )
  }

  await compete("order", false)
  await compete("invoice", true)

  console.log("100 CONCURRENT PREPARATION ATTEMPTS VERIFIED")
  console.log("ATOMIC PURCHASE CONCURRENCY TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}