import crypto from "node:crypto"
import { createGuestCheckoutToken } from "../utils/guestCheckoutToken.js"
import { createV3OrderFingerprint } from "../utils/smartShippingV3OrderFingerprint.js"
import { createV3SignedQuote } from "../utils/smartShippingV3QuoteSigning.js"
import test from "node:test"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Order from "../models/Order.js"
import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  persistV3ProductionCheckoutAtomic
} from "../utils/persistV3ProductionCheckoutAtomic.js"

// Isolated test only. No Atlas connection or Square calls.
process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"

const ID = new mongoose.Types.ObjectId()
let replset

test.before(async () => {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  })

  await mongoose.connect(replset.getUri(), {
    dbName: "signavi_v3_atomic_persistence_test",
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_v3_atomic_persistence_test"
  )

  // Native insertion avoids unrelated Order creation
  // hooks. The actual Mongoose model is used for reads.
  await mongoose.connection.db.collection(
    Order.collection.name
  ).insertOne({
    _id: ID,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "usd",
    subtotal: 40,
    tax: 3.30,
    finalPrice: 43.30,
    squareEnvironment: null,
    squareExpectedAmountCents: null
  })

  await Promise.all([
    Reservation.init(),
    PaymentOperation.init()
  ])
})

test.after(async () => {
  await mongoose.disconnect()
  if (replset) await replset.stop()
})

test("Invalid signed quote cannot initialize payment state", async () => {
  const result = await persistV3ProductionCheckoutAtomic({
    Order,
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId: String(ID),
    guestToken: "invalid-test-token",
    signedQuote: "invalid-test-quote"
  })

  assert.equal(result.prepared, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  const [order, reservations, operations] =
    await Promise.all([
      Order.findById(ID).lean(),
      Reservation.countDocuments({ orderId: ID }),
      PaymentOperation.countDocuments({ orderId: ID })
    ])

  assert.equal(reservations, 0)
  assert.equal(operations, 0)
  assert.equal(order.finalPrice, 43.30)
  assert.equal(order.squareEnvironment, null)
  assert.equal(order.squareExpectedAmountCents, null)
})

test("Invalid purchase identity cannot start initialization", async () => {
  const result = await persistV3ProductionCheckoutAtomic({
    Order,
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId: "invalid",
    guestToken: "invalid-test-token",
    signedQuote: "invalid-test-quote"
  })

  assert.equal(result.prepared, false)
  assert.equal(result.reason, "INVALID_CHECKOUT_INPUT")
  assert.equal(result.squareRequestAuthorized, false)
})

test("Valid signed checkout commits all three production records", async () => {
  // Test-only signing secrets. No production credentials.
  process.env.SHIPPING_QUOTE_SECRET =
    crypto.randomBytes(32).toString("hex")
  process.env.SHIPPING_V3_QUOTE_SECRET =
    crypto.randomBytes(48).toString("hex")

  const id = new mongoose.Types.ObjectId()

  await new Order({
    _id: id,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: "V3 Production Atomic Test",
    email: "v3-atomic@example.com",
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

  const order = await Order.findById(id)

  const guestToken = createGuestCheckoutToken(order)

  const signedQuote = createV3SignedQuote({
    cartFingerprint: createV3OrderFingerprint(order),
    shippingAmountCents: 1200,
    parcelRateIds: ["test_rate_1", "test_rate_2"],
    carrier: "USPS",
    serviceToken: "usps_ground_advantage"
  })

  const result = await persistV3ProductionCheckoutAtomic({
    Order,
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId: String(id),
    guestToken,
    signedQuote
  })

  assert.equal(
    result.persistedAndVerified,
    true,
    `Atomic persistence failed: ${result.reason ?? "unknown"}`
  )

  assert.equal(result.amountCents, 5528)
  assert.equal(result.shippingAmountCents, 1200)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  const [storedOrder, reservation, operation] =
    await Promise.all([
      Order.findById(id).lean(),
      Reservation.findOne({
        environment: "production",
        orderId: id
      }).lean(),
      PaymentOperation.findOne({
        environment: "production",
        orderId: id
      }).lean()
    ])

  const purchaseKey =
    `signavi-v3-production-purchase-${String(id)}`

  assert.ok(storedOrder)
  assert.ok(reservation)
  assert.ok(operation)

  assert.equal(storedOrder.finalPrice, 55.28)
  assert.equal(storedOrder.shipping, 12)
  assert.equal(storedOrder.squareEnvironment, "production")
  assert.equal(storedOrder.squareExpectedAmountCents, 5528)

  assert.equal(reservation.purchaseKey, purchaseKey)
  assert.equal(reservation.status, "reserved")

  assert.equal(operation.idempotencyKey, purchaseKey)
  assert.equal(operation.amountCents, 5528)
  assert.equal(operation.status, "pending")
  assert.equal(operation.paymentUrl, "")
  assert.equal(operation.squarePaymentLinkId, "")

  assert.equal(
    await Reservation.countDocuments({ orderId: id }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: id }),
    1
  )
  // Duplicate request with the same legitimate credentials.
  const duplicate = await persistV3ProductionCheckoutAtomic({
    Order,
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId: String(id),
    guestToken,
    signedQuote
  })

  assert.equal(
    duplicate.prepared,
    false,
    "Duplicate checkout cannot initialize a second payment"
  )
  assert.equal(duplicate.squareRequestAuthorized, false)
  assert.equal(duplicate.retryAuthorized, false)

  const [duplicateReservations, duplicateOperations, unchanged] =
    await Promise.all([
      Reservation.countDocuments({ orderId: id }),
      PaymentOperation.countDocuments({ orderId: id }),
      Order.findById(id).lean()
    ])

  assert.equal(duplicateReservations, 1)
  assert.equal(duplicateOperations, 1)
  assert.equal(unchanged.finalPrice, 55.28)
  assert.equal(unchanged.squareExpectedAmountCents, 5528)
})

async function createSignedProductionFixture() {
  process.env.SHIPPING_QUOTE_SECRET =
    crypto.randomBytes(32).toString("hex")
  process.env.SHIPPING_V3_QUOTE_SECRET =
    crypto.randomBytes(48).toString("hex")

  const id = new mongoose.Types.ObjectId()

  const order = await new Order({
    _id: id,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: "V3 Transaction Test",
    email: "v3-transaction@example.com",
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

  return {
    id,
    guestToken: createGuestCheckoutToken(order),
    signedQuote: createV3SignedQuote({
      cartFingerprint: createV3OrderFingerprint(order),
      shippingAmountCents: 1200,
      parcelRateIds: ["test_rate_1", "test_rate_2"],
      carrier: "USPS",
      serviceToken: "usps_ground_advantage"
    })
  }
}

test("Concurrent production checkout creates one payment identity", async () => {
  const fixture = await createSignedProductionFixture()

  const attempts = await Promise.all(
    Array.from({ length: 8 }, () =>
      persistV3ProductionCheckoutAtomic({
        Order,
        Reservation,
        PaymentOperation,
        startSession: () => mongoose.startSession(),
        orderId: String(fixture.id),
        guestToken: fixture.guestToken,
        signedQuote: fixture.signedQuote
      })
    )
  )

  const successes = attempts.filter(
    result => result.persistedAndVerified === true
  )

  assert.equal(successes.length, 1)
  assert.ok(attempts.every(
    result => result.squareRequestAuthorized === false
  ))

  const [order, reservations, operations] = await Promise.all([
    Order.findById(fixture.id).lean(),
    Reservation.find({ orderId: fixture.id }).lean(),
    PaymentOperation.find({ orderId: fixture.id }).lean()
  ])

  assert.equal(order.finalPrice, 55.28)
  assert.equal(order.squareExpectedAmountCents, 5528)
  assert.equal(reservations.length, 1)
  assert.equal(operations.length, 1)
  assert.equal(operations[0].amountCents, 5528)
  assert.equal(operations[0].status, "pending")
})

test("Payment operation insertion failure rolls back all writes", async () => {
  const fixture = await createSignedProductionFixture()

  const failingPaymentOperation = {
    create: async () => {
      throw new Error("SIMULATED_PAYMENT_OPERATION_FAILURE")
    },
    findOne: (...args) => PaymentOperation.findOne(...args)
  }

  const result = await persistV3ProductionCheckoutAtomic({
    Order,
    Reservation,
    PaymentOperation: failingPaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId: String(fixture.id),
    guestToken: fixture.guestToken,
    signedQuote: fixture.signedQuote
  })

  assert.equal(result.prepared, false)
  assert.equal(result.squareRequestAuthorized, false)

  const [order, reservations, operations] = await Promise.all([
    Order.findById(fixture.id).lean(),
    Reservation.countDocuments({ orderId: fixture.id }),
    PaymentOperation.countDocuments({ orderId: fixture.id })
  ])

  assert.equal(reservations, 0)
  assert.equal(operations, 0)
  assert.notEqual(order.squareEnvironment, "production")
  assert.equal(order.squareExpectedAmountCents, null)
  assert.notEqual(order.finalPrice, 55.28)
})