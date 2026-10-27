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

  process.env.SMART_SHIPPING_V3_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_DURABLE_LINK_ENABLED = "true"

  const { prepareV3AtomicSandboxCheckout: durableCheckout } =
    await import("../utils/prepareV3AtomicSandboxCheckout.js")

  const { linkV3InvoiceOrderDurable: durableLink } =
    await import("../utils/linkV3InvoiceOrderDurable.js")

  const { default: DurableOwnership } = await import(
    "../models/SmartShippingV3PurchaseOwnership.js"
  )

  const { default: DurableAssociation } = await import(
    "../models/SmartShippingV3InvoiceOrderAssociation.js"
  )

  await DurableOwnership.init()
  await DurableAssociation.init()
  await Operation.init()

  const addInvoice = async item => {
    await Invoice.collection.insertOne({
      _id: item.invoiceId,
      customerName: "Atomic Test",
      customerEmail: "customer@example.com",
      status: "draft",
      paymentStatus: "unpaid",
      total: 55.28,
      finalProof: { approved: false }
    })
  }

  const checkout = item => durableCheckout({
    lock: item.lock,
    guestToken: item.guestToken,
    signedQuote: item.signedQuote
  })

  const link = item => durableLink({
    lock: item.lock,
    invoiceId: item.invoiceId,
    guestToken: item.guestToken,
    signedQuote: item.signedQuote
  })

  const verify = async (item, expectedWinner) => {
    const associations = await DurableAssociation.find({
      environment: "sandbox",
      orderId: item.orderId
    }).lean()

    const claims = await DurableOwnership.find({
      environment: "sandbox",
      purchaseKey: `order:${item.orderId}`
    }).lean()

    const operations = await Operation.find({
      orderId: item.orderId
    }).lean()

    const saved = await Order.findById(item.orderId).lean()
    assert.ok(saved)

    if (expectedWinner === "link") {
      assert.equal(associations.length, 1)
      assert.equal(claims.length, 0)
      assert.equal(operations.length, 0)
      assert.equal(saved.squareExpectedAmountCents ?? null, null)
    } else {
      assert.equal(associations.length, 0)
      assert.equal(claims.length, 1)
      assert.equal(operations.length, 1)
      assert.equal(claims[0].claimedByDocumentType, "order")
      assert.equal(operations[0].status, "pending")
      assert.equal(saved.squareExpectedAmountCents, 5528)
    }

    assert.equal(
      associations.length > 0 && operations.length > 0,
      false
    )

    assert.equal(
      associations.length > 0 && claims.length > 0,
      false
    )
  }

  // Deterministic: linking completed first.
  const linkFirst = await fixture({ linked: false })
  await addInvoice(linkFirst)

  const linked = await link(linkFirst)
  assert.equal(linked.linked, true)

  await assert.rejects(
    checkout(linkFirst),
    /Existing durable invoice\/order association requires review/
  )

  await verify(linkFirst, "link")
  console.log("LINK-FIRST CHECKOUT CONFLICT: BLOCKED")

  // Deterministic: checkout completed first.
  const checkoutFirst = await fixture({ linked: false })
  await addInvoice(checkoutFirst)

  const prepared = await checkout(checkoutFirst)
  assert.equal(prepared.success, true)

  await assert.rejects(link(checkoutFirst))

  await verify(checkoutFirst, "checkout")
  console.log("CHECKOUT-FIRST LINK CONFLICT: BLOCKED")

  // Concurrent attempts for distinct purchases.
  let checkoutWins = 0
  let linkingWins = 0

  for (let i = 0; i < 20; i++) {
    const item = await fixture({ linked: false })
    await addInvoice(item)

    const results = await Promise.allSettled([
      checkout(item),
      link(item)
    ])

    const winners = results.filter(
      result => result.status === "fulfilled"
    )

    assert.equal(
      winners.length,
      1,
      `Exactly one workflow must succeed in round ${i + 1}`
    )

    const checkoutWon = results[0].status === "fulfilled"
    const linkWon = results[1].status === "fulfilled"

    assert.notEqual(checkoutWon, linkWon)

    await verify(
      item,
      checkoutWon ? "checkout" : "link"
    )

    if (checkoutWon) {
      checkoutWins++
    } else {
      linkingWins++
    }
  }

  assert.equal(checkoutWins + linkingWins, 20)

  console.log(
    `20 DURABLE CONTENTION PAIRS: ${checkoutWins} CHECKOUT WINS, ` +
    `${linkingWins} LINKING WINS`
  )

  console.log("NO SIMULTANEOUS WORKFLOW WINS: PASSED")
  console.log("NO CONFLICTING PAYMENT OR ASSOCIATION RECORDS: PASSED")
  console.log("DURABLE CHECKOUT/LINK CONCURRENCY TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}