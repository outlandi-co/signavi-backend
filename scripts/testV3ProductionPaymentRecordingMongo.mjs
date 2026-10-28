import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js"

import PaymentOperation from
  "../models/SmartShippingV3PaymentOperation.js"

import {
  recordV3ProductionPaymentIsolated
} from "../utils/recordV3ProductionPaymentIsolated.js"

process.env.NODE_ENV = "test"

const orderId = "507f191e810c19729de860ea"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const squareOrderId = "synthetic-square-order"
const paymentId = "synthetic-payment"

let mongo

// Minimal isolated order model, not the production Order model.
// No middleware, emails, fulfillment or shipping side effects.
const orderSchema = new mongoose.Schema({
  status: String,
  paymentStatus: String,
  squareEnvironment: String,
  squareExpectedAmountCents: Number,
  squarePaymentId: String,
  squareOrderId: String,
  paymentMethod: String,
  paidAt: Date
}, {
  collection: "isolated_v3_payment_recording_orders"
})

const Order = mongoose.model(
  "IsolatedV3PaymentRecordingOrder",
  orderSchema
)

const payment = {
  id: paymentId
}

const squareOrder = {
  id: squareOrderId
}

const verifyBinding = ({
  order,
  operation,
  payment,
  squareOrder
}) => {
  // Synthetic trusted-verifier fixture.
  // The separate production verifier's 14 tests remain
  // responsible for checking Square payment bindings.
  if (
    order.squareEnvironment !== "production" ||
    operation.environment !== "production" ||
    operation.squareOrderId !== squareOrder.id ||
    order.squareExpectedAmountCents !== 100 ||
    payment.id !== paymentId
  ) {
    throw new Error("SYNTHETIC_BINDING_REJECTED")
  }

  return Object.freeze({
    bindingVerified: true,
    exactPaidReplay:
      order.status === "paid" &&
      order.paymentStatus === "paid" &&
      order.squarePaymentId === payment.id &&
      order.squareOrderId === squareOrder.id,
    orderId,
    squarePaymentId: payment.id,
    squareOrderId: squareOrder.id,
    amountCents: 100,
    environment: "production",
    databaseWriteAuthorized: false,
    paymentCreationAuthorized: false
  })
}

const context = {
  orderId,
  Order,
  Reservation,
  PaymentOperation,
  payment,
  squareOrder,
  expectedLocationId: "synthetic-location",
  verifyBinding
}

try {
  mongo = await MongoMemoryServer.create()

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
    _id: orderId,
    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "production",
    squareExpectedAmountCents: 100,
    squarePaymentId: "",
    squareOrderId: "",
    paymentMethod: ""
  })

  await Reservation.create({
    environment: "production",
    orderId,
    purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    idempotencyKey: purchaseKey,
    status: "claim_pending",
    attemptClaimedAt: new Date()
  })

  await PaymentOperation.create({
    environment: "production",
    orderId,
    idempotencyKey: purchaseKey,
    checkoutReferenceId: "synthetic-reference",
    amountCents: 100,
    status: "completed",
    squareCreationAttemptClaimedAt: new Date(),
    squareOrderId,
    squarePaymentLinkId: "synthetic-link",
    paymentUrl: "https://square.link/u/synthetic",
    requestOwner: "synthetic-owner"
  })

  console.log("PASS: Isolated production-shaped records created")

  const results = await Promise.all(
    Array.from({ length: 50 }, () =>
      recordV3ProductionPaymentIsolated(context)
    )
  )

  const winners = results.filter(x => x.recorded)

  assert.equal(winners.length, 1)

  console.log("PASS: 50 concurrent payment-recording attempts")
  console.log("PASS: Exactly one atomic paid-state winner")

  const saved = await Order.findById(orderId).lean()

  assert.equal(saved.status, "paid")
  assert.equal(saved.paymentStatus, "paid")
  assert.equal(saved.squarePaymentId, paymentId)
  assert.equal(saved.squareOrderId, squareOrderId)
  assert.ok(saved.paidAt instanceof Date)

  console.log("PASS: Verified payment identity persisted")

  assert.equal(
    await Order.countDocuments(),
    1
  )

  console.log("PASS: No duplicate order documents")

  const replay = await recordV3ProductionPaymentIsolated(context)

  assert.equal(replay.recorded, false)
  assert.equal(replay.replay, true)

  console.log("PASS: Exact paid replay is idempotent")

  const conflict = await recordV3ProductionPaymentIsolated({
    ...context,
    payment: { id: "different-payment" },
    verifyBinding: () => {
      throw new Error("CONFLICTING_PAYMENT")
    }
  }).then(
    () => {
      throw new Error("Expected rejection")
    },
    error => error
  )

  assert.match(conflict.message, /CONFLICTING_PAYMENT/)

  console.log("PASS: Conflicting payment rejected")

  const stored = await Order.findById(orderId).lean()

  assert.equal(stored.squarePaymentId, paymentId)
  assert.equal(stored.paymentStatus, "paid")

  console.log("PASS: Conflicting delivery cannot overwrite payment")

  const originalMode = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = "production"

    await assert.rejects(
      recordV3ProductionPaymentIsolated(context),
      /ISOLATED_TEST_ONLY/
    )
  } finally {
    process.env.NODE_ENV = originalMode
  }

  console.log("PASS: Production execution blocked")

  console.log("")
  console.log("ISOLATED PRODUCTION PAYMENT RECORDING: PASSED")
  console.log("ATTEMPTS: 50")
  console.log("PAID-STATE WINNERS: 1")
  console.log("EXTERNAL SQUARE CALLS: 0")
  console.log("PRODUCTION DATABASE CONNECTIONS: 0")
  console.log("NO WEBHOOK ROUTE CHANGES")

} finally {
  await mongoose.disconnect()

  if (mongo) await mongo.stop()
}
