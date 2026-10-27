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

  const { linkV3InvoiceOrderIsolated: link } = await import(
    "../utils/linkV3InvoiceOrderIsolated.js"
  )

  const makeItem = async () => {
    const item = await fixture({ linked: false })

    await Invoice.collection.insertOne({
      _id: item.invoiceId,
      customerName: "Atomic Test",
      customerEmail: "customer@example.com",
      status: "draft",
      paymentStatus: "unpaid",
      total: 55.28,
      finalProof: { approved: false }
    })

    return item
  }

  const linkItem = item => link({
    lock: item.lock,
    invoiceId: item.invoiceId,
    guestToken: item.guestToken,
    signedQuote: item.signedQuote
  })

  const verify = async (item, checkoutWon, linkingWon) => {
    const association = await Association.findOne({
      orderId: item.orderId,
      environment: "sandbox"
    }).lean()

    const recordCounts = await counts(item)
    const saved = await Order.findById(item.orderId).lean()

    assert.equal(checkoutWon && linkingWon, false)

    if (checkoutWon) {
      assert.equal(association, null)
      assert.deepEqual(recordCounts, {
        claims: 1,
        operations: 1
      })
      assert.equal(saved.squareEnvironment, "sandbox")
      assert.equal(saved.squareExpectedAmountCents, 5528)
    } else if (linkingWon) {
      assert.ok(association)
      assert.equal(
        String(association.invoiceId),
        String(item.invoiceId)
      )
      assert.deepEqual(recordCounts, {
        claims: 0,
        operations: 0
      })
    } else {
      // Both rejected under contention: no partial ownership.
      assert.equal(association, null)
      assert.deepEqual(recordCounts, {
        claims: 0,
        operations: 0
      })
    }
  }

  // Deterministically verify the other winning outcome.
  const linkedFirst = await makeItem()

  const linkedResult = await linkItem(linkedFirst)
  assert.equal(linkedResult.linked, true)

  await assert.rejects(
    execute(linkedFirst, "order"),
    /Invoice association owns purchase path/
  )

  await verify(linkedFirst, false, true)
  console.log("LINKING FIRST: CHECKOUT BLOCKED")

  let checkoutWins = 0
  let linkingWins = 0
  let bothRejected = 0

  for (let i = 0; i < 20; i++) {
    const item = await makeItem()

    const attempts = i % 2 === 0
      ? [execute(item, "order"), linkItem(item)]
      : [linkItem(item), execute(item, "order")]

    const results = await Promise.allSettled(attempts)

    const checkoutIndex = i % 2 === 0 ? 0 : 1
    const linkIndex = i % 2 === 0 ? 1 : 0

    const checkoutWon =
      results[checkoutIndex].status === "fulfilled"

    const linkingWon =
      results[linkIndex].status === "fulfilled"

    await verify(item, checkoutWon, linkingWon)

    if (checkoutWon) checkoutWins++
    else if (linkingWon) linkingWins++
    else bothRejected++
  }

  assert.equal(checkoutWins + linkingWins + bothRejected, 20)

  console.log("20 CONCURRENT LINK/CHECKOUT PAIRS VERIFIED")
  console.log(`CHECKOUT WINS: ${checkoutWins}`)
  console.log(`LINKING WINS: ${linkingWins}`)
  console.log(`BOTH REJECTED WITHOUT PARTIAL WRITES: ${bothRejected}`)
  console.log("INVOICE LINK/CHECKOUT CONTENTION TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}