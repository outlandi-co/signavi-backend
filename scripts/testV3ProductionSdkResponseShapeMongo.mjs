import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import { createV3ProductionResolvedEvidenceBoundaryIsolated } from "../utils/createV3ProductionResolvedEvidenceBoundaryIsolated.js"
import { readFileSync } from "node:fs"

const identityUrl = new URL(
  "../utils/smartShippingV3ReferenceIdentity.js",
  import.meta.url
)

const identityModule = await import(identityUrl.href)

let createV3SquareSafeCheckoutReference =
  identityModule.createV3SquareSafeCheckoutReference

if (typeof createV3SquareSafeCheckoutReference !== "function") {
  const source = readFileSync(identityUrl, "utf8")

  const match = source.match(
    /import\s*\{[^}]*\bcreateV3SquareSafeCheckoutReference\b[^}]*\}\s*from\s*["']([^"']+)["']/s
  )

  assert.ok(match, "Square-safe reference creator import not found")

  const sourceModule = await import(
    new URL(match[1], identityUrl).href
  )

  createV3SquareSafeCheckoutReference =
    sourceModule.createV3SquareSafeCheckoutReference
}

assert.equal(
  typeof createV3SquareSafeCheckoutReference,
  "function"
)

process.env.NODE_ENV = "test"

const id = "507f191e810c19729de86401"
const purchaseKey = `signavi-v3-production-purchase-${id}`
const reference = createV3SquareSafeCheckoutReference({ orderId: id })
const locationId = "isolated-location"

const previousProductionLocation =
  process.env.SQUARE_PRODUCTION_LOCATION_ID

process.env.SQUARE_PRODUCTION_LOCATION_ID = locationId
const squareId = "isolated-square-order"
const paymentId = "isolated-square-payment"

const Order = mongoose.model(
  "IsolatedV3VerifiedTransactionOrder",
  new mongoose.Schema({
    status: String,
    paymentStatus: String,
    squareEnvironment: String,
    squareExpectedAmountCents: Number,
    currency: String,
    squarePaymentId: String,
    squareOrderId: String,
    squarePaymentLinkId: String,
    paymentUrl: String,
    paymentMethod: String,
    paidAt: Date
  }, { collection: "isolated_v3_verified_transaction_orders" })
)

const payment = {
  id: paymentId,
  orderId: squareId,
  locationId,
  status: "COMPLETED",
  orderId: squareId,
  locationId: locationId,
  amountMoney: { amount: 100n, currency: "USD" }
}

const squareOrder = {
  id: squareId,
  locationId,
  tenders: [{ paymentId }],
  referenceId: reference,
  locationId: locationId,
  totalMoney: { amount: 100n, currency: "USD" }
}

let mongo

try {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  })

  const uri = mongo.getUri()

  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/)

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  })

  await Promise.all([
    Order.init(),
    Reservation.init(),
    PaymentOperation.init()
  ])

  await Order.create({
    _id: id,
    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "production",
    squareExpectedAmountCents: 100,
    currency: "USD",
    squarePaymentId: "",
    squareOrderId: "",
    squarePaymentLinkId: "",
    paymentUrl: ""
  })

  await Reservation.create({
    environment: "production",
    orderId: id,
    purchaseKey,
    idempotencyKey: purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: id,
    status: "claim_pending",
    attemptClaimedAt: new Date()
  })

  await PaymentOperation.create({
    environment: "production",
    orderId: id,
    idempotencyKey: purchaseKey,
    checkoutReferenceId: reference,
    amountCents: 100,
    status: "completed",
    squareCreationAttemptClaimedAt: new Date(),
    requestOwner: "isolated-owner",
    squareOrderId: squareId,
    squarePaymentLinkId: "isolated-link",
    paymentUrl: "https://square.link/u/isolated"
  })

  let orderReads = 0
  let paymentReads = 0
  let paymentCreates = 0
  let attackerLookups = 0

  let currentPayment = payment
  let currentSquareOrder = squareOrder

  const testClient = {
    orders: {
      get: async ({ orderId }, options) => {
        orderReads++
        assert.equal(orderId, squareId)
        assert.equal(options.maxRetries, 0)

        return { order: currentSquareOrder }
      }
    },

    payments: {
      get: async ({ paymentId: requestedId }, options) => {
        paymentReads++
        assert.equal(requestedId, paymentId)
        assert.equal(options.maxRetries, 0)

        return { payment: currentPayment }
      },

      create: async () => {
        paymentCreates++
        throw new Error("PAYMENT_CREATION_FORBIDDEN")
      }
    }
  }

  // Complete reader-to-verifier-to-recorder integration.
  // SDK responses are mocked; MongoDB transactions are real
  // within the isolated in-memory replica set.
  const boundary =
    createV3ProductionResolvedEvidenceBoundaryIsolated({
      testClient
    })

  async function verifyAndRecord(
    paymentInput = payment,
    orderInput = squareOrder
  ) {
    // The test changes fixture responses, not the bound provider.
    currentPayment = paymentInput
    currentSquareOrder = orderInput

    return boundary.record({
      orderId: id,
      connection: mongoose.connection,
      Order,
      Reservation,
      PaymentOperation,

      // Caller-controlled overrides must be ignored.
      expectedLocationId: "attacker-location",
      lookupSquareEvidence: async () => {
        attackerLookups++
        throw new Error("ATTACKER_PROVIDER_CALLED")
      },
      verifiedBinding: {
        bindingVerified: true,
        databaseWriteAuthorized: true
      }
    })
  }

  const success = await verifyAndRecord()

  assert.equal(success.recorded, true)
  assert.equal(success.squareCreationAuthorized, false)

  const saved = await Order.findById(id).lean()

  assert.equal(saved.status, "paid")
  assert.equal(saved.paymentStatus, "paid")
  assert.equal(saved.squarePaymentId, paymentId)
  assert.equal(saved.squareOrderId, squareId)

  console.log("PASS: Real verifier accepts synthetic Square lookup fixtures")
  console.log("PASS: Transaction durably records verified payment")

  const replay = await verifyAndRecord()

  assert.equal(replay.replay, true)
  assert.equal(replay.recorded, false)

  console.log("PASS: Exact paid replay creates no second write")

  await assert.rejects(
    verifyAndRecord({
      ...payment,
      id: "conflicting-payment"
    }),
    /(?:SQUARE_PAYMENT_IDENTITY_MISMATCH|rejected)/
  )

  console.log("PASS: Conflicting payment rejected")

  await assert.rejects(
    verifyAndRecord({
      ...payment,
      amountMoney: { amount: 999n, currency: "USD" }
    }),
    /rejected/
  )

  console.log("PASS: Wrong amount rejected")

  await assert.rejects(
    verifyAndRecord(payment, {
      ...squareOrder,
      locationId: "wrong-location"
    }),
    /(?:SQUARE_ORDER_IDENTITY_MISMATCH|rejected)/
  )

  console.log("PASS: Wrong Square location rejected")

  assert.equal(
    await Order.countDocuments({
      _id: id,
      paymentStatus: "paid",
      squarePaymentId: paymentId
    }),
    1
  )

  console.log("PASS: Exactly one matching paid order persists")

  assert.equal(orderReads, 5)
  assert.equal(paymentReads, 4)
  assert.equal(paymentCreates, 0)
  assert.equal(attackerLookups, 0)

  console.log("PASS: Request-supplied Square provider never called")

  console.log("PASS: All five attempts used order-based Square retrieval")
  console.log("PASS: Payment IDs resolved from stored Square order")
  console.log("PASS: No payment creation calls")

  console.log("")
  console.log("STEP 98 SDK RESPONSE SHAPE MONGODB: PASSED")
  console.log("DATABASE: ISOLATED MONGODB REPLICA SET")
  console.log("SQUARE: MOCKED SDK, NO EXTERNAL CALLS")
  console.log("NO PRODUCTION WEBHOOK CHANGES")
  console.log("NO LIVE PAYMENT CREATION")

} finally {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()

  if (previousProductionLocation === undefined) {
    delete process.env.SQUARE_PRODUCTION_LOCATION_ID
  } else {
    process.env.SQUARE_PRODUCTION_LOCATION_ID =
      previousProductionLocation
  }
}
