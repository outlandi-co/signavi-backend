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
  process.env.SMART_SHIPPING_V3_DURABLE_LINK_ENABLED = "true"

  const { linkV3InvoiceOrderDurable: durableLink } =
    await import("../utils/linkV3InvoiceOrderDurable.js")

  const { default: DurableAssociation } =
    await import("../models/SmartShippingV3InvoiceOrderAssociation.js")

  const { default: DurableOwnership } =
    await import("../models/SmartShippingV3PurchaseOwnership.js")

  await DurableAssociation.init()
  await DurableOwnership.init()

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

  const link = (item, overrides = {}) => durableLink({
    lock: item.lock,
    invoiceId: item.invoiceId,
    guestToken: item.guestToken,
    signedQuote: item.signedQuote,
    ...overrides
  })

  // 1. Successful durable association.
  const valid = await fixture({ linked: false })
  await addInvoice(valid)

  const linked = await link(valid)

  assert.equal(linked.linked, true)
  assert.equal(linked.amountCents, 5528)
  assert.equal(linked.squareRequestAuthorized, false)
  assert.equal(linked.paymentCreated, false)

  assert.equal(
    await DurableAssociation.countDocuments({
      orderId: valid.orderId,
      environment: "sandbox"
    }),
    1
  )

  assert.equal(
    await Operation.countDocuments({
      orderId: valid.orderId
    }),
    0
  )

  assert.equal(
    await DurableOwnership.countDocuments({
      purchaseKey: `order:${valid.orderId}`,
      environment: "sandbox"
    }),
    0
  )

  console.log("DURABLE INVOICE LINK: PASSED")
  console.log("LINK CREATED WITHOUT PAYMENT OWNERSHIP: PASSED")

  // 2. Duplicate linking must preserve the original.
  await assert.rejects(
    link(valid),
    /Existing durable invoice\/order association requires review/
  )

  assert.equal(
    await DurableAssociation.countDocuments({
      orderId: valid.orderId
    }),
    1
  )

  console.log("DUPLICATE DURABLE LINK: BLOCKED")

  // 3. Invalid quote must leave no association.
  const invalid = await fixture({ linked: false })
  await addInvoice(invalid)

  await assert.rejects(
    link(invalid, {
      signedQuote: "invalid-signed-quote"
    })
  )

  assert.equal(
    await DurableAssociation.countDocuments({
      orderId: invalid.orderId
    }),
    0
  )

  console.log("INVALID QUOTE: NO DURABLE ASSOCIATION")

  // 4. Existing canonical ownership must block linking.
  const owned = await fixture({ linked: false })
  await addInvoice(owned)

  await DurableOwnership.create({
    environment: "sandbox",
    purchaseKey: `order:${owned.orderId}`,
    claimedByDocumentType: "order",
    claimedByDocumentId: owned.orderId,
    status: "reconciliation_required"
  })

  await assert.rejects(
    link(owned),
    /Durable invoice payment evidence rejected/
  )

  assert.equal(
    await DurableAssociation.countDocuments({
      orderId: owned.orderId
    }),
    0
  )

  assert.equal(
    await DurableOwnership.countDocuments({
      purchaseKey: `order:${owned.orderId}`
    }),
    1
  )

  console.log("EXISTING PURCHASE OWNERSHIP: BLOCKED")

  // 5. Wrong lock owner must not create an association.
  const wrongOwner = await fixture({ linked: false })
  await addInvoice(wrongOwner)

  await assert.rejects(
    link(wrongOwner, {
      lock: {
        ...wrongOwner.lock,
        owner: "invalid-lock-owner"
      }
    }),
    /V3 checkout lock ownership required/
  )

  assert.equal(
    await DurableAssociation.countDocuments({
      orderId: wrongOwner.orderId
    }),
    0
  )

  console.log("INVALID CHECKOUT LOCK OWNER: BLOCKED")

  // 6. Ensure none of the linking cases created payments.
  assert.equal(
    await Operation.countDocuments(),
    0
  )

  console.log("NO PAYMENT OPERATIONS CREATED")
  console.log("DURABLE INVOICE LINKING REGRESSION PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}