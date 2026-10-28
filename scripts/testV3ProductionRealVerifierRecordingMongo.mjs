import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import { verifyV3ProductionWebhookPaymentBinding } from "../utils/smartShippingV3ProductionWebhookPaymentBinding.js"
import { recordV3ProductionPaymentIsolated } from "../utils/recordV3ProductionPaymentIsolated.js"

process.env.NODE_ENV = "test"

// Resolve the same Square-safe reference creator used by the
// existing reference identity module, without duplicating its logic.
const identityUrl = new URL("../utils/smartShippingV3ReferenceIdentity.js", import.meta.url)
const identityModule = await import(identityUrl.href)

let makeReference = identityModule.createV3SquareSafeCheckoutReference

if (typeof makeReference !== "function") {
  const source = readFileSync(identityUrl, "utf8")
  const match = source.match(
    /import\s*\{[^}]*\bcreateV3SquareSafeCheckoutReference\b[^}]*\}\s*from\s*["']([^"']+)["']/s
  )

  assert.ok(match, "Square-safe reference creator import not found")

  const sourceModule = await import(new URL(match[1], identityUrl).href)
  makeReference = sourceModule.createV3SquareSafeCheckoutReference
}

assert.equal(typeof makeReference, "function")

const schema = new mongoose.Schema({
  status: String,
  paymentStatus: String,
  squareEnvironment: String,
  squareExpectedAmountCents: Number,
  currency: String,
  squarePaymentId: { type: String, default: "" },
  squareOrderId: { type: String, default: "" },
  squarePaymentLinkId: { type: String, default: "" },
  paymentUrl: { type: String, default: "" },
  paymentMethod: String,
  paidAt: Date
}, { collection: "isolated_v3_real_verifier_orders" })

const Order = mongoose.model("IsolatedV3RealVerifierOrder", schema)

const locationId = "synthetic-production-location"
let mongo

function key(id) {
  return `signavi-v3-production-purchase-${id}`
}

async function seed(id, suffix) {
  const reference = makeReference({ orderId: id })
  const squareId = `synthetic-square-order-${suffix}`
  const paymentId = `synthetic-payment-${suffix}`

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
    purchaseKey: key(id),
    claimedByDocumentType: "order",
    claimedByDocumentId: id,
    idempotencyKey: key(id),
    status: "claim_pending",
    attemptClaimedAt: new Date()
  })

  await PaymentOperation.create({
    environment: "production",
    orderId: id,
    idempotencyKey: key(id),
    checkoutReferenceId: reference,
    amountCents: 100,
    status: "completed",
    squareCreationAttemptClaimedAt: new Date(),
    requestOwner: "synthetic-test-owner",
    squareOrderId: squareId,
    squarePaymentLinkId: `synthetic-link-${suffix}`,
    paymentUrl: `https://square.link/u/synthetic-${suffix}`
  })

  return {
    orderId: id,
    Order,
    Reservation,
    PaymentOperation,
    expectedLocationId: locationId,
    verifyBinding: verifyV3ProductionWebhookPaymentBinding,
    payment: {
      id: paymentId,
      status: "COMPLETED",
      order_id: squareId,
      location_id: locationId,
      amount_money: { amount: 100, currency: "USD" }
    },
    squareOrder: {
      id: squareId,
      reference_id: reference,
      location_id: locationId,
      total_money: { amount: 100, currency: "USD" }
    }
  }
}

try {
  mongo = await MongoMemoryServer.create()

  assert.match(mongo.getUri(), /^mongodb:\/\/127\.0\.0\.1:/)

  await mongoose.connect(mongo.getUri(), {
    serverSelectionTimeoutMS: 5000
  })

  await Promise.all([
    Order.init(),
    Reservation.init(),
    PaymentOperation.init()
  ])

  const first = await seed(
    "507f191e810c19729de86101",
    "concurrent"
  )

  const results = await Promise.all(
    Array.from({ length: 50 }, () =>
      recordV3ProductionPaymentIsolated(first)
    )
  )

  assert.equal(results.filter(x => x.recorded).length, 1)
  assert.ok(results.every(x =>
    x.squareCreationAuthorized === false &&
    x.retryAuthorized === false
  ))

  console.log("PASS: Real verifier accepts trusted synthetic Square fixtures")
  console.log("PASS: 50 concurrent attempts produce exactly one paid write")
  console.log("PASS: No result authorizes Square creation or retry")

  const saved = await Order.findById(first.orderId).lean()

  assert.equal(saved.status, "paid")
  assert.equal(saved.paymentStatus, "paid")
  assert.equal(saved.squarePaymentId, first.payment.id)
  assert.equal(saved.squareOrderId, first.squareOrder.id)

  console.log("PASS: Exact verified payment persisted")

  const replay = await recordV3ProductionPaymentIsolated(first)

  assert.equal(replay.replay, true)
  assert.equal(replay.recorded, false)

  console.log("PASS: Real verifier recognizes exact paid replay")

  await assert.rejects(
    recordV3ProductionPaymentIsolated({
      ...first,
      payment: {
        ...first.payment,
        id: "conflicting-synthetic-payment"
      }
    }),
    /rejected/
  )

  console.log("PASS: Real verifier rejects conflicting paid replay")

  const wrongAmount = await seed(
    "507f191e810c19729de86102",
    "wrong-amount"
  )

  await assert.rejects(
    recordV3ProductionPaymentIsolated({
      ...wrongAmount,
      payment: {
        ...wrongAmount.payment,
        amount_money: { amount: 999, currency: "USD" }
      }
    }),
    /rejected/
  )

  const unpaid = await Order.findById(wrongAmount.orderId).lean()
  assert.equal(unpaid.paymentStatus, "unpaid")

  console.log("PASS: Wrong amount cannot mark order paid")

  const interrupted = await seed(
    "507f191e810c19729de86103",
    "interrupted"
  )

  await assert.rejects(
    recordV3ProductionPaymentIsolated({
      ...interrupted,
      afterOrderWrite: async () => {
        throw new Error("SIMULATED_PROCESS_INTERRUPTION")
      }
    }),
    /SIMULATED_PROCESS_INTERRUPTION/
  )

  const persisted = await Order.findById(interrupted.orderId).lean()
  assert.equal(persisted.paymentStatus, "paid")
  assert.equal(persisted.squarePaymentId, interrupted.payment.id)

  const recovered = await recordV3ProductionPaymentIsolated(interrupted)
  assert.equal(recovered.recorded, false)
  assert.equal(recovered.replay, true)

  console.log("PASS: Interrupted order write remains durable")
  console.log("PASS: Recovery recognizes exact paid replay")
  console.log("PASS: Recovery performs no second paid write")

  const originalEnvironment = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = "production"

    await assert.rejects(
      recordV3ProductionPaymentIsolated(first),
      /ISOLATED_TEST_ONLY/
    )
  } finally {
    process.env.NODE_ENV = originalEnvironment
  }

  console.log("PASS: Production-mode execution remains disabled")

  console.log("")
  console.log("STEP 53 REAL-VERIFIER INTEGRATION: PASSED")
  console.log("DATABASE: ISOLATED IN-MEMORY MONGODB")
  console.log("SQUARE API: NOT CALLED")
  console.log("PRODUCTION WEBHOOK: UNCHANGED")
  console.log("NO PAYMENT CREATION")

} finally {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
}
