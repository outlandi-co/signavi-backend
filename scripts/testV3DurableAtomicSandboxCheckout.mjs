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

  {
  process.env.NODE_ENV = "test"
  process.env.SQUARE_ENVIRONMENT = "sandbox"
  process.env.SMART_SHIPPING_V3_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED = "true"

  const { prepareV3AtomicSandboxCheckout: prepare } =
    await import("../utils/prepareV3AtomicSandboxCheckout.js")

  const { default: Ownership } =
    await import("../models/SmartShippingV3PurchaseOwnership.js")

  await Ownership.init()

  // Success: ownership, payment operation, and order must bind.
  const item = await fixture({ linked: false })

  const result = await prepare({
    lock: item.lock,
    guestToken: item.guestToken,
    signedQuote: item.signedQuote
  })

  assert.equal(result.success, true)
  assert.equal(result.orderPaymentBound, true)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.paymentCreated, false)

  const ownership = await Ownership.find({
    environment: "sandbox",
    purchaseKey: `order:${item.orderId}`
  }).lean()

  const operations = await Operation.find({
    orderId: item.orderId
  }).lean()

  const saved = await Order.findById(item.orderId).lean()

  assert.equal(ownership.length, 1)
  assert.equal(operations.length, 1)
  assert.ok(saved)

  assert.equal(ownership[0].claimedByDocumentType, "order")

  assert.equal(
    String(ownership[0].claimedByDocumentId),
    String(item.orderId)
  )

  assert.equal(operations[0].status, "pending")
  assert.equal(operations[0].amountCents, 5528)
  assert.equal(saved.squareEnvironment, "sandbox")
  assert.equal(saved.squareExpectedAmountCents, 5528)
  assert.equal(Math.round(saved.shipping * 100), 1200)
  assert.equal(Math.round(saved.finalPrice * 100), 5528)

  console.log("DURABLE OWNERSHIP + OPERATION + ORDER: PASSED")

  // Duplicate attempts must not create a second payment.
  await assert.rejects(
    prepare({
      lock: item.lock,
      guestToken: item.guestToken,
      signedQuote: item.signedQuote
    })
  )

  assert.equal(
    await Ownership.countDocuments({
      purchaseKey: `order:${item.orderId}`,
      environment: "sandbox"
    }),
    1
  )

  assert.equal(
    await Operation.countDocuments({ orderId: item.orderId }),
    1
  )

  console.log("DUPLICATE PREPARATION: BLOCKED")

  // Invalid credentials cannot create payment ownership.
  const invalid = await fixture({ linked: false })

  await assert.rejects(
    prepare({
      lock: invalid.lock,
      guestToken: invalid.guestToken,
      signedQuote: "invalid-signed-quote"
    })
  )

  assert.equal(
    await Ownership.countDocuments({
      purchaseKey: `order:${invalid.orderId}`,
      environment: "sandbox"
    }),
    0
  )

  assert.equal(
    await Operation.countDocuments({ orderId: invalid.orderId }),
    0
  )

  console.log("INVALID QUOTE: NO OWNERSHIP OR PAYMENT OPERATION")
  // A failure after saving the order must roll back
  // ownership, operation, and every order change.
  const rollbackItem = await fixture({ linked: false })

  const beforeRollback = await Order.findById(
    rollbackItem.orderId
  ).lean()

  await assert.rejects(
    prepare({
      lock: rollbackItem.lock,
      guestToken: rollbackItem.guestToken,
      signedQuote: rollbackItem.signedQuote,
      simulateFailureAfterOrderSave: true
    }),
    /SIMULATED_DURABLE_ORDER_SAVE_FAILURE/
  )

  assert.equal(
    await Ownership.countDocuments({
      purchaseKey: `order:${rollbackItem.orderId}`,
      environment: "sandbox"
    }),
    0
  )

  assert.equal(
    await Operation.countDocuments({
      orderId: rollbackItem.orderId
    }),
    0
  )

  const afterRollback = await Order.findById(
    rollbackItem.orderId
  ).lean()

  assert.deepEqual(afterRollback, beforeRollback)

  console.log("DURABLE CLAIM + OPERATION + ORDER ROLLBACK: PASSED")
  // Existing payment reservation must prevent a new purchase.
  const { default: PaymentReservation } = await import(
    "../models/SharedSquarePaymentReservation.js"
  )

  const reserved = await fixture({ linked: false })

  await PaymentReservation.create({
    documentType: "order",
    documentId: reserved.orderId,
    environment: "sandbox",
    amountCents: 5528,
    owner: "existing-payment-owner",
    idempotencyKey: `existing-${reserved.orderId}`,
    status: "reconciliation_required"
  })

  await assert.rejects(
    prepare({
      lock: reserved.lock,
      guestToken: reserved.guestToken,
      signedQuote: reserved.signedQuote
    }),
    /Existing payment reservation requires review/
  )

  assert.equal(
    await Ownership.countDocuments({
      purchaseKey: `order:${reserved.orderId}`,
      environment: "sandbox"
    }),
    0
  )

  assert.equal(
    await Operation.countDocuments({ orderId: reserved.orderId }),
    0
  )

  console.log("EXISTING PAYMENT RESERVATION: BLOCKED")

  // An existing payment operation must never be replaced.
  const operationItem = await fixture({ linked: false })

  const existingOperation = await Operation.create({
    orderId: operationItem.orderId,
    checkoutReferenceId: `existing-${operationItem.orderId}`,
    idempotencyKey: `existing-operation-${operationItem.orderId}`,
    amountCents: 5528,
    environment: "sandbox",
    status: "reconciliation_required"
  })

  await assert.rejects(
    prepare({
      lock: operationItem.lock,
      guestToken: operationItem.guestToken,
      signedQuote: operationItem.signedQuote
    }),
    /Existing payment operation requires review/
  )

  const retainedOperation = await Operation.findById(
    existingOperation._id
  ).lean()

  assert.ok(retainedOperation)
  assert.equal(retainedOperation.status, "reconciliation_required")

  assert.equal(
    await Operation.countDocuments({ orderId: operationItem.orderId }),
    1
  )

  assert.equal(
    await Ownership.countDocuments({
      purchaseKey: `order:${operationItem.orderId}`,
      environment: "sandbox"
    }),
    0
  )

  console.log("EXISTING PAYMENT OPERATION: PRESERVED")

  // Existing canonical ownership blocks checkout.
  const owned = await fixture({ linked: false })

  await Ownership.create({
    environment: "sandbox",
    purchaseKey: `order:${owned.orderId}`,
    claimedByDocumentType: "invoice",
    claimedByDocumentId: new mongoose.Types.ObjectId(),
    status: "reconciliation_required"
  })

  await assert.rejects(
    prepare({
      lock: owned.lock,
      guestToken: owned.guestToken,
      signedQuote: owned.signedQuote
    }),
    /Existing purchase ownership requires review/
  )

  assert.equal(
    await Ownership.countDocuments({
      purchaseKey: `order:${owned.orderId}`,
      environment: "sandbox"
    }),
    1
  )

  assert.equal(
    await Operation.countDocuments({ orderId: owned.orderId }),
    0
  )

  console.log("EXISTING DURABLE OWNERSHIP: PRESERVED")

  // Valid order identity with the wrong lock owner must fail.
  const wrongOwner = await fixture({ linked: false })

  await assert.rejects(
    prepare({
      lock: {
        ...wrongOwner.lock,
        owner: "not-the-checkout-lock-owner"
      },
      guestToken: wrongOwner.guestToken,
      signedQuote: wrongOwner.signedQuote
    }),
    /V3 checkout lock ownership required/
  )

  assert.equal(
    await Ownership.countDocuments({
      purchaseKey: `order:${wrongOwner.orderId}`,
      environment: "sandbox"
    }),
    0
  )

  assert.equal(
    await Operation.countDocuments({ orderId: wrongOwner.orderId }),
    0
  )

  console.log("INVALID CHECKOUT LOCK OWNER: BLOCKED")
  console.log("EXISTING PAYMENT EVIDENCE REGRESSION PASSED")
  console.log("DURABLE ATOMIC SANDBOX CHECKOUT TEST PASSED")
  console.log("NO SQUARE REQUESTS")
  }
} finally {
  await mongoose.disconnect()
  await replica.stop()
}