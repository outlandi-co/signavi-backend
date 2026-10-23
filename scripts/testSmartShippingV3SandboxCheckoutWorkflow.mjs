import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  prepareV3SandboxCheckoutWorkflow
} from "../utils/smartShippingV3SandboxCheckoutWorkflow.js"

import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"

import {
  createV3OrderFingerprint
} from "../utils/smartShippingV3OrderFingerprint.js"

import {
  createV3SignedQuote
} from "../utils/smartShippingV3QuoteSigning.js"

const dbName = "signavi_shipping_v3_dev"

const ids = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
]

const locksCollection = "smart_shipping_v3_checkout_locks"

process.env.NODE_ENV = "development"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SQUARE_ENVIRONMENT = "sandbox"

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

delete process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED

let connected = false

const createFixture = async id => {
  await new Order({
    _id: id,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: `V3 WORKFLOW ${crypto.randomUUID()}`,
    email: "v3-workflow-test@example.com",
    address: {
      street: "123 Test Street",
      city: "Test City",
      state: "CA",
      zip: "90001",
      country: "US"
    },
    subtotal: 39.98,
    tax: 3.30,
    finalPrice: 43.28,
    items: [{
      productId: new mongoose.Types.ObjectId(),
      quantity: 2,
      finalPrice: 19.99,
      variant: {
        color: "black",
        size: "L"
      }
    }]
  }).save()

  const order = await Order.findById(id)

  assert.ok(order)

  return {
    orderId: String(id),
    guestToken: createGuestCheckoutToken(order),
    signedQuote: createV3SignedQuote({
      cartFingerprint: createV3OrderFingerprint(order),
      shippingAmountCents: 1200,
      parcelRateIds: [
        "test_rate_1",
        "test_rate_2"
      ],
      carrier: "USPS",
      serviceToken: "usps_ground_advantage"
    })
  }
}

const assertNoPreparation = async id => {
  assert.equal(
    await PaymentOperation.countDocuments({
      orderId: id
    }),
    0
  )

  assert.equal(
    await mongoose.connection
      .collection(locksCollection)
      .countDocuments({ _id: id }),
    0
  )
}

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(mongoose.connection.name, dbName)

  console.log("ISOLATED V3 DATABASE: PASS")

  const valid = await createFixture(ids[0])
  const invalid = await createFixture(ids[1])

  const original = await Order.findById(ids[0]).lean()

  // A missing preparation flag must stop all writes.
  await assert.rejects(
    prepareV3SandboxCheckoutWorkflow(valid),
    /workflow is disabled/
  )

  assert.deepEqual(
    await Order.findById(ids[0]).lean(),
    original
  )

  await assertNoPreparation(ids[0])

  console.log("WORKFLOW DISABLED BY DEFAULT: PASS")
  console.log("DISABLED WORKFLOW HAS NO WRITES: PASS")

  process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED =
    "true"

  // An invalid quote must be rejected before locking.
  await assert.rejects(
    prepareV3SandboxCheckoutWorkflow({
      ...invalid,
      signedQuote: invalid.signedQuote + "tampered"
    }),
    /authorization or quote invalid/
  )

  await assertNoPreparation(ids[1])

  console.log("INVALID QUOTE BLOCKED BEFORE LOCK: PASS")

  // An invalid guest token must also cause no writes.
  await assert.rejects(
    prepareV3SandboxCheckoutWorkflow({
      ...invalid,
      guestToken: "invalid-guest-token"
    }),
    /authorization or quote invalid/
  )

  await assertNoPreparation(ids[1])

  console.log("INVALID GUEST TOKEN BLOCKED: PASS")

  // Legitimate Sandbox preparation.
  const result = await prepareV3SandboxCheckoutWorkflow(
    valid
  )

  assert.equal(result.success, true)
  assert.equal(result.orderPaymentBound, true)
  assert.equal(result.amountCents, 5528)
  assert.equal(result.shippingAmountCents, 1200)
  assert.equal(result.squareRequestAuthorized, false)

  const savedOrder = await Order.findById(ids[0]).lean()

  const operation = await PaymentOperation.findOne({
    orderId: ids[0]
  }).lean()

  const lock = await mongoose.connection
    .collection(locksCollection)
    .findOne({ _id: ids[0] })

  assert.ok(savedOrder)
  assert.ok(operation)
  assert.ok(lock)

  assert.equal(savedOrder.squareEnvironment, "sandbox")
  assert.equal(savedOrder.squareExpectedAmountCents, 5528)
  assert.equal(Math.round(savedOrder.finalPrice * 100), 5528)
  assert.equal(Math.round(savedOrder.shipping * 100), 1200)

  assert.equal(operation.amountCents, 5528)
  assert.equal(operation.environment, "sandbox")
  assert.equal(operation.status, "pending")
  assert.equal(
    operation.checkoutReferenceId,
    result.checkoutReferenceId
  )

  console.log("SANDBOX PREPARATION PERSISTED: PASS")
  console.log("ORDER AND OPERATION AMOUNTS MATCH: PASS")
  console.log("CHECKOUT LOCK PRESERVED: PASS")

  // Repeated checkout must not create another operation.
  const repeated = await prepareV3SandboxCheckoutWorkflow(
    valid
  )

  assert.equal(repeated.success, false)
  assert.equal(repeated.reason, "checkout_in_progress")
  assert.equal(repeated.squareRequestAuthorized, false)

  assert.equal(
    await PaymentOperation.countDocuments({
      orderId: ids[0]
    }),
    1
  )

  console.log("REPEATED CHECKOUT BLOCKED: PASS")
  console.log("SINGLE PAYMENT OPERATION: PASS")

  console.log("ALL V3 SANDBOX WORKFLOW TESTS PASSED")
  console.log("NO SQUARE API REQUESTS")

} catch (error) {
  console.error(
    "V3 SANDBOX WORKFLOW TEST FAILED:",
    error
  )

  process.exitCode = 1

} finally {
  delete process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED

  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await PaymentOperation.deleteMany({
        orderId: { $in: ids }
      })

      await mongoose.connection
        .collection(locksCollection)
        .deleteMany({
          _id: { $in: ids }
        })

      await Order.deleteMany({
        _id: { $in: ids }
      })

      console.log("CLEANUP: Temporary V3 records removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error)
      process.exitCode = 1
    }
  }

  if (connected) {
    await mongoose.disconnect()
  }
}