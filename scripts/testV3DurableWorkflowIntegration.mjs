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
  process.env.SMART_SHIPPING_V3_DURABLE_WORKFLOW_TEST_ENABLED = "true"

  const { prepareV3SandboxCheckoutWorkflow: workflow } =
    await import("../utils/smartShippingV3SandboxCheckoutWorkflow.js")

  const { default: Ownership } = await import(
    "../models/SmartShippingV3PurchaseOwnership.js"
  )

  const { default: DurableAssociation } = await import(
    "../models/SmartShippingV3InvoiceOrderAssociation.js"
  )

  await Ownership.init()
  await DurableAssociation.init()
  await Operation.init()

  const execute = item => workflow({
    orderId: String(item.orderId),
    guestToken: item.guestToken,
    signedQuote: item.signedQuote
  })

  const count = async item => ({
    claims: await Ownership.countDocuments({
      environment: "sandbox",
      purchaseKey: `order:${item.orderId}`
    }),
    operations: await Operation.countDocuments({
      orderId: item.orderId
    }),
    associations: await DurableAssociation.countDocuments({
      environment: "sandbox",
      orderId: item.orderId
    })
  })

  const { releaseV3CheckoutLock } = await import(
    "../utils/smartShippingV3CheckoutLock.js"
  )

  // 1. Normal workflow delegates to durable preparation.
  const valid = await fixture({ linked: false })

  assert.equal(
    await releaseV3CheckoutLock(valid.lock),
    true,
    "Fixture lock must be released before workflow acquires its own"
  )

  const result = await execute(valid)

  console.log("WORKFLOW RESULT:", {
    success: result?.success,
    reason: result?.reason ?? null,
    orderPaymentBound: result?.orderPaymentBound ?? null,
    squareRequestAuthorized: result?.squareRequestAuthorized ?? null,
    paymentCreated: result?.paymentCreated ?? null
  })

  assert.equal(result.success, true)
  assert.equal(result.orderPaymentBound, true)
  assert.equal(result.amountCents, 5528)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.paymentCreated, false)

  assert.deepEqual(await count(valid), {
    claims: 1,
    operations: 1,
    associations: 0
  })

  console.log("NORMAL WORKFLOW DURABLE PREPARATION: PASSED")

  // 2. A second workflow call cannot acquire the same lock.
  const duplicate = await execute(valid)

  assert.equal(duplicate.success, false)
  assert.equal(duplicate.reason, "checkout_in_progress")
  assert.equal(duplicate.squareRequestAuthorized, false)
  assert.equal(duplicate.paymentCreated, false)

  assert.deepEqual(await count(valid), {
    claims: 1,
    operations: 1,
    associations: 0
  })

  console.log("NORMAL WORKFLOW DUPLICATE LOCK: BLOCKED")

  // 3. A previously associated invoice blocks standalone checkout.
  const associated = await fixture({ linked: false })

  assert.equal(
    await releaseV3CheckoutLock(associated.lock),
    true,
    "Associated fixture lock must be released before workflow"
  )

  await DurableAssociation.create({
    environment: "sandbox",
    invoiceId: associated.invoiceId,
    orderId: associated.orderId,
    purchaseKey: `order:${associated.orderId}`,
    amountCents: 5528
  })

  const originalOrder = await Order.findById(
    associated.orderId
  ).lean()

  await assert.rejects(
    execute(associated),
    /Existing durable invoice\/order association requires review/
  )

  assert.deepEqual(await count(associated), {
    claims: 0,
    operations: 0,
    associations: 1
  })

  const finalOrder = await Order.findById(
    associated.orderId
  ).lean()

  assert.deepEqual(finalOrder, originalOrder)

  console.log("NORMAL WORKFLOW LINKED INVOICE: BLOCKED")
  console.log("REJECTED WORKFLOW LEFT ORDER UNCHANGED: PASSED")
  // Flag disabled: preserve the original isolated-test workflow.
  const legacy = await fixture({ linked: false })

  assert.equal(await releaseV3CheckoutLock(legacy.lock), true)

  process.env.SMART_SHIPPING_V3_DURABLE_WORKFLOW_TEST_ENABLED = "false"

  try {
    const legacyResult = await execute(legacy)

    assert.equal(legacyResult.success, true)
    assert.equal(legacyResult.squareRequestAuthorized, false)
    assert.equal(legacyResult.paymentCreated, false)

    assert.equal(
      await Purchase.countDocuments({
        environment: "sandbox",
        purchaseKey: `order:${legacy.orderId}`
      }),
      1
    )

    assert.deepEqual(await count(legacy), {
      claims: 0,
      operations: 1,
      associations: 0
    })

    console.log("LEGACY WORKFLOW FLAG-DISABLED: PASSED")
  } finally {
    process.env.SMART_SHIPPING_V3_DURABLE_WORKFLOW_TEST_ENABLED = "true"
  }

  // Explicit durable test flag with missing prerequisites fails closed.
  const denied = await fixture({ linked: false })
  assert.equal(await releaseV3CheckoutLock(denied.lock), true)

  process.env.SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED = "false"

  try {
    await assert.rejects(
      execute(denied),
      /Durable workflow test requires isolated sandbox prerequisites/
    )

    assert.deepEqual(await count(denied), {
      claims: 0,
      operations: 0,
      associations: 0
    })

    assert.equal(
      await Purchase.countDocuments({
        environment: "sandbox",
        purchaseKey: `order:${denied.orderId}`
      }),
      0
    )

    console.log("INVALID DURABLE TEST PREREQUISITES: BLOCKED")
  } finally {
    process.env.SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED = "true"
  }
  console.log("NORMAL DURABLE WORKFLOW INTEGRATION TEST PASSED")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}