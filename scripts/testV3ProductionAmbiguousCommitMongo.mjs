import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import { recordV3ProductionVerifiedEntryIsolated } from "../utils/recordV3ProductionVerifiedEntryIsolated.js"
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
  status: "COMPLETED",
  order_id: squareId,
  location_id: locationId,
  amount_money: { amount: 100, currency: "USD" }
}

const squareOrder = {
  id: squareId,
  reference_id: reference,
  location_id: locationId,
  total_money: { amount: 100, currency: "USD" }
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

  let evidenceLookups = 0
  let recordingConnection = mongoose.connection

  async function verifyAndRecord(
    paymentInput = payment,
    orderInput = squareOrder
  ) {
    return recordV3ProductionVerifiedEntryIsolated({
      orderId: id,
      connection: recordingConnection,
      Order,
      Reservation,
      PaymentOperation,
      expectedLocationId: locationId,

      // Synthetic trusted-adapter substitute, TEST ONLY.
      // Production must own the authenticated Square lookup.
      lookupSquareEvidence: async ({ squareOrderId }) => {
        evidenceLookups++

        assert.equal(squareOrderId, squareId)

        return {
          payment: paymentInput,
          squareOrder: orderInput
        }
      }
    })
  }

  // Simulate a lost acknowledgment AFTER a successful commit.
  // This wrapper does not retry a transaction.
  // It throws only after the real transaction completes.
  recordingConnection = {
    startSession: async () => {
      const session = await mongoose.connection.startSession()

      // Preserve the real MongoDB ClientSession, including
      // inTransaction(), transaction state, and driver metadata.
      const originalWithTransaction =
        session.withTransaction.bind(session)

      session.withTransaction = async (callback, options) => {
        // Commit using the genuine driver session.
        const result = await originalWithTransaction(
          callback,
          options
        )

        // Simulate the application losing its acknowledgment
        // only AFTER the transaction has committed.
        throw new Error("SIMULATED_ACK_LOSS_AFTER_COMMIT")
      }

      return session
    }
  }

  try {
    await assert.rejects(
      verifyAndRecord(),
      /SIMULATED_ACK_LOSS_AFTER_COMMIT/
    )
  } finally {
    recordingConnection = mongoose.connection
  }

  console.log("PASS: Commit acknowledgment loss simulated")

  const saved = await Order.findById(id).lean()

  assert.equal(saved.status, "paid")
  assert.equal(saved.paymentStatus, "paid")
  assert.equal(saved.squarePaymentId, paymentId)
  assert.equal(saved.squareOrderId, squareId)

  console.log("PASS: Real verifier accepts synthetic Square lookup fixtures")
  console.log("PASS: Transaction durably records verified payment")

  // First post-error check: the original payment must exist.
  const recovered = await verifyAndRecord()

  assert.equal(recovered.replay, true)
  assert.equal(recovered.recorded, false)

  console.log("PASS: Post-error recovery finds committed payment")

  // A subsequent duplicate delivery must also be read-only.
  const replay = await verifyAndRecord()

  assert.equal(replay.replay, true)
  assert.equal(replay.recorded, false)

  console.log("PASS: Duplicate delivery remains read-only")

  await assert.rejects(
    verifyAndRecord({
      ...payment,
      id: "conflicting-payment"
    }),
    /rejected/
  )

  console.log("PASS: Conflicting payment rejected")

  await assert.rejects(
    verifyAndRecord({
      ...payment,
      amount_money: { amount: 999, currency: "USD" }
    }),
    /rejected/
  )

  console.log("PASS: Wrong amount rejected")

  await assert.rejects(
    verifyAndRecord(payment, {
      ...squareOrder,
      location_id: "wrong-location"
    }),
    /rejected/
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

  assert.equal(evidenceLookups, 6)

  console.log("PASS: All six attempts used the evidence lookup")

  console.log("")
  console.log("STEP 69 AMBIGUOUS COMMIT RECOVERY: PASSED")
  console.log("DATABASE: ISOLATED MONGODB REPLICA SET")
  console.log("SQUARE: SYNTHETIC FIXTURES, NO EXTERNAL CALLS")
  console.log("NO PRODUCTION WEBHOOK CHANGES")
  console.log("NO LIVE PAYMENT CREATION")

} finally {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
}
