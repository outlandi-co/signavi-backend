import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

process.env.NODE_ENV = "test"

const schema = new mongoose.Schema({
  status: String,
  paymentStatus: String,
  squareEnvironment: String,
  squareExpectedAmountCents: Number,
  squarePaymentId: String,
  squareOrderId: String
}, {
  collection: "isolated_v3_transaction_orders"
})

const Order = mongoose.model("IsolatedV3TransactionOrder", schema)

const ids = {
  valid: "507f191e810c19729de86201",
  reservationDrift: "507f191e810c19729de86202",
  operationDrift: "507f191e810c19729de86203"
}

const key = id => `signavi-v3-production-purchase-${id}`

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
    squareOrderId: `square-${id}`,
    squarePaymentLinkId: `link-${id}`,
    paymentUrl: "https://square.link/u/synthetic",
    requestOwner: "isolated-test"
  })
}

// This is a test-local transaction prototype, not a production export.
// Verification of authenticated Square lookups is covered separately.
async function recordTransaction(id, afterReads) {
  const session = await mongoose.startSession()

  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(id).session(session)
      const reservation = await Reservation.findOne({
        environment: "production",
        orderId: id,
        purchaseKey: key(id)
      }).session(session)

      const operation = await PaymentOperation.findOne({
        environment: "production",
        orderId: id
      }).session(session)

      assert.ok(order && reservation && operation)

      if (
        order.status !== "payment_required" ||
        order.paymentStatus !== "unpaid" ||
        order.squareEnvironment !== "production" ||
        order.squareExpectedAmountCents !== 100 ||
        reservation.status !== "claim_pending" ||
        !reservation.attemptClaimedAt ||
        reservation.claimedByDocumentType !== "order" ||
        String(reservation.claimedByDocumentId) !== id ||
        reservation.idempotencyKey !== key(id) ||
        operation.status !== "completed" ||
        !operation.squareCreationAttemptClaimedAt ||
        operation.idempotencyKey !== key(id)
      ) {
        throw new Error("INCONSISTENT_DURABLE_STATE")
      }

      if (afterReads) await afterReads()

      // Guarded writes make concurrent changes to either record
      // conflict with this transaction instead of relying on
      // stale snapshot reads.
      const reservationClaim = await Reservation.updateOne({
        _id: reservation._id,
        status: "claim_pending",
        claimedByDocumentType: "order",
        claimedByDocumentId: id,
        idempotencyKey: key(id)
      }, {
        $currentDate: { updatedAt: true }
      }, { session })

      if (reservationClaim.matchedCount !== 1) {
        throw new Error("RESERVATION_STATE_CHANGED")
      }

      const operationClaim = await PaymentOperation.updateOne({
        _id: operation._id,
        environment: "production",
        status: "completed",
        idempotencyKey: key(id),
        squareOrderId: `square-${id}`
      }, {
        $currentDate: { updatedAt: true }
      }, { session })

      if (operationClaim.matchedCount !== 1) {
        throw new Error("OPERATION_STATE_CHANGED")
      }

      const paid = await Order.updateOne({
        _id: id,
        status: "payment_required",
        paymentStatus: "unpaid",
        squareEnvironment: "production",
        squareExpectedAmountCents: 100
      }, {
        $set: {
          status: "paid",
          paymentStatus: "paid",
          squarePaymentId: `payment-${id}`,
          squareOrderId: `square-${id}`
        }
      }, { session })

      if (paid.modifiedCount !== 1) {
        throw new Error("ORDER_ALREADY_CHANGED")
      }
    }, {
      maxCommitTimeMS: 5000
    })
  } finally {
    await session.endSession()
  }
}

try {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  })

  const uri = mongo.getUri()

  // The only permitted connection is to the temporary
  // replica set created by this test.
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/)

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  })

  await Promise.all([
    Order.init(),
    Reservation.init(),
    PaymentOperation.init()
  ])

  await seed(ids.valid)

  await recordTransaction(ids.valid)

  const valid = await Order.findById(ids.valid).lean()

  assert.equal(valid.paymentStatus, "paid")
  assert.equal(valid.squarePaymentId, `payment-${ids.valid}`)

  console.log("PASS: Consistent transaction records payment")

  await seed(ids.reservationDrift)

  await assert.rejects(
    recordTransaction(ids.reservationDrift, async () => {
      await Reservation.updateOne({
        orderId: ids.reservationDrift
      }, {
        $set: { status: "reconciliation_required" }
      })
    })
  )

  const reservationOrder =
    await Order.findById(ids.reservationDrift).lean()

  assert.equal(reservationOrder.paymentStatus, "unpaid")

  console.log("PASS: Concurrent reservation change aborts paid update")

  await seed(ids.operationDrift)

  await assert.rejects(
    recordTransaction(ids.operationDrift, async () => {
      await PaymentOperation.updateOne({
        orderId: ids.operationDrift
      }, {
        $set: { status: "reconciliation_required" }
      })
    })
  )

  const operationOrder =
    await Order.findById(ids.operationDrift).lean()

  assert.equal(operationOrder.paymentStatus, "unpaid")

  console.log("PASS: Concurrent operation change aborts paid update")

  assert.equal(await Order.countDocuments({
    paymentStatus: "paid"
  }), 1)

  console.log("PASS: Only the unchanged purchase was recorded")

  console.log("")
  console.log("STEP 58 TRANSACTION PROOF: PASSED")
  console.log("DATABASE: TEMPORARY IN-MEMORY REPLICA SET")
  console.log("NO PRODUCTION DATABASE")
  console.log("NO SQUARE API CALLS")
  console.log("NO WEBHOOK CHANGES")

} finally {
  await mongoose.disconnect()
  if (mongo) await mongo.stop()
}
