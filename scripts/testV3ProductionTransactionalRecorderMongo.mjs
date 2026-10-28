import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  recordV3ProductionPaymentTransactionalIsolated
} from "../utils/recordV3ProductionPaymentTransactionalIsolated.js"

process.env.NODE_ENV = "test"

const Order = mongoose.model(
  "IsolatedV3TransactionalRecorderOrder",
  new mongoose.Schema({
    status: String,
    paymentStatus: String,
    squareEnvironment: String,
    squareExpectedAmountCents: Number,
    squarePaymentId: String,
    squareOrderId: String,
    paymentMethod: String,
    paidAt: Date
  }, { collection: "isolated_v3_transactional_recorder_orders" })
)

const ids = {
  valid: "507f191e810c19729de86301",
  reservationDrift: "507f191e810c19729de86302",
  operationDrift: "507f191e810c19729de86303"
}

const key = id => `signavi-v3-production-purchase-${id}`
const squareOrderId = id => `synthetic-order-${id}`
const squarePaymentId = id => `synthetic-payment-${id}`

const binding = id => ({
  bindingVerified: true,
  environment: "production",
  orderId: id,
  squareOrderId: squareOrderId(id),
  squarePaymentId: squarePaymentId(id),
  amountCents: 100,
  databaseWriteAuthorized: false,
  paymentCreationAuthorized: false
})

let mongo

async function seed(id) {
  await Order.create({
    _id: id,
    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "production",
    squareExpectedAmountCents: 100,
    squarePaymentId: "",
    squareOrderId: ""
  })

  await Reservation.create({
    environment: "production",
    orderId: id,
    purchaseKey: key(id),
    idempotencyKey: key(id),
    claimedByDocumentType: "order",
    claimedByDocumentId: id,
    status: "claim_pending",
    attemptClaimedAt: new Date()
  })

  await PaymentOperation.create({
    environment: "production",
    orderId: id,
    idempotencyKey: key(id),
    amountCents: 100,
    status: "completed",
    squareCreationAttemptClaimedAt: new Date(),
    squareOrderId: squareOrderId(id),
    squarePaymentLinkId: `synthetic-link-${id}`,
    paymentUrl: "https://square.link/u/synthetic",
    requestOwner: "isolated-test"
  })
}

const record = (id, afterReads) =>
  recordV3ProductionPaymentTransactionalIsolated({
    orderId: id,
    connection: mongoose.connection,
    Order,
    Reservation,
    PaymentOperation,
    verifiedBinding: binding(id),
    afterReads
  })

try {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  })

  assert.match(mongo.getUri(), /^mongodb:\/\/127\.0\.0\.1:/)

  await mongoose.connect(mongo.getUri(), {
    serverSelectionTimeoutMS: 5000
  })

  await Promise.all([
    Order.init(),
    Reservation.init(),
    PaymentOperation.init()
  ])

  await seed(ids.valid)

  const success = await record(ids.valid)

  assert.equal(success.recorded, true)
  assert.equal(success.squareCreationAuthorized, false)
  assert.equal(success.retryAuthorized, false)

  const saved = await Order.findById(ids.valid).lean()

  assert.equal(saved.status, "paid")
  assert.equal(saved.paymentStatus, "paid")
  assert.equal(saved.squarePaymentId, squarePaymentId(ids.valid))

  console.log("PASS: Transactional recorder persists one verified payment")

  await assert.rejects(
    record(ids.valid),
    /INCONSISTENT_PURCHASE_STATE/
  )

  assert.equal(
    await Order.countDocuments({
      _id: ids.valid,
      paymentStatus: "paid"
    }),
    1
  )

  console.log("PASS: Repeated recording cannot update paid order")

  await seed(ids.reservationDrift)

  await assert.rejects(
    record(ids.reservationDrift, async () => {
      await Reservation.updateOne({
        orderId: ids.reservationDrift
      }, {
        $set: { status: "reconciliation_required" }
      })
    })
  )

  assert.equal(
    (await Order.findById(ids.reservationDrift)).paymentStatus,
    "unpaid"
  )

  console.log("PASS: Reservation drift aborts payment transaction")

  await seed(ids.operationDrift)

  await assert.rejects(
    record(ids.operationDrift, async () => {
      await PaymentOperation.updateOne({
        orderId: ids.operationDrift
      }, {
        $set: { status: "reconciliation_required" }
      })
    })
  )

  assert.equal(
    (await Order.findById(ids.operationDrift)).paymentStatus,
    "unpaid"
  )

  console.log("PASS: Operation drift aborts payment transaction")

  assert.equal(
    await Order.countDocuments({ paymentStatus: "paid" }),
    1
  )

  console.log("PASS: No partial or duplicate paid-state updates")

  const previousEnvironment = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = "production"

    await assert.rejects(
      record(ids.valid),
      /ISOLATED_TEST_ONLY/
    )
  } finally {
    process.env.NODE_ENV = previousEnvironment
  }

  console.log("PASS: Live production execution remains blocked")

  console.log("")
  console.log("STEP 60 TRANSACTIONAL RECORDER TESTS: PASSED")
  console.log("DATABASE: ISOLATED REPLICA SET")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PRODUCTION DATABASE")
  console.log("NO WEBHOOK CHANGES")

} finally {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
}
