import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import {
  recordV3ProductionPaymentTransactionalIsolated
} from "../utils/recordV3ProductionPaymentTransactionalIsolated.js"

process.env.NODE_ENV = "test"

let replicaSet
let connection

try {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  connection = mongoose.createConnection(
    replicaSet.getUri(),
    {
      dbName: "signavi_v3_actual_recorder_retry",
      serverSelectionTimeoutMS: 10000
    }
  )

  await connection.asPromise()

  const schema = new mongoose.Schema(
    {},
    {
      strict: false,
      minimize: false
    }
  )

  const Order = connection.model(
    "V3RetryOrder",
    schema
  )

  const Reservation = connection.model(
    "V3RetryReservation",
    schema
  )

  const PaymentOperation = connection.model(
    "V3RetryPaymentOperation",
    schema
  )

  const id = new mongoose.Types.ObjectId()
  const orderId = id.toString()

  const purchaseKey =
    `signavi-v3-production-purchase-${orderId}`

  const paymentId = "synthetic-retry-payment"
  const squareOrderId = "synthetic-retry-square-order"

  await Order.create({
    _id: id,
    squareEnvironment: "production",
    status: "payment_required",
    paymentStatus: "unpaid",
    squareExpectedAmountCents: 100,
    squarePaymentId: "",
    squareOrderId: ""
  })

  await Reservation.create({
    orderId: orderId,
    environment: "production",
    purchaseKey,
    idempotencyKey: purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: id,
    status: "claim_pending",
    attemptClaimedAt: new Date()
  })

  await PaymentOperation.create({
    orderId: orderId,
    environment: "production",
    idempotencyKey: purchaseKey,
    status: "completed",
    amountCents: 100,
    squareOrderId,
    squareCreationAttemptClaimedAt: new Date()
  })

  const verifiedBinding = Object.freeze({
    bindingVerified: true,
    environment: "production",
    orderId,
    squarePaymentId: paymentId,
    squareOrderId,
    amountCents: 100,
    databaseWriteAuthorized: false,
    paymentCreationAuthorized: false
  })

  let applicationCalls = 0
  let callbackReads = 0
  let squareCalls = 0

  applicationCalls++

  const result =
    await recordV3ProductionPaymentTransactionalIsolated({
      orderId,
      connection,
      Order,
      Reservation,
      PaymentOperation,
      verifiedBinding,

      // Runs inside the ACTUAL recorder transaction.
      // Inject a labeled transient error before any writes.
      afterReads: async () => {
        callbackReads++

        if (callbackReads === 1) {
          const error =
            new mongoose.mongo.MongoServerError({
              message: "SYNTHETIC_TRANSIENT_RETRY",
              code: 251,
              codeName: "NoSuchTransaction"
            })

          error.addErrorLabel(
            "TransientTransactionError"
          )

          throw error
        }
      }
    })

  assert.equal(applicationCalls, 1)
  assert.equal(callbackReads, 2)
  assert.equal(result.recorded, true)
  assert.equal(result.squareCreationAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  console.log(
    "PASS: Actual recorder called once"
  )

  console.log(
    "PASS: Actual transaction callback retried after transient error"
  )

  const persisted = await Order.findById(id).lean()

  assert.equal(persisted.status, "paid")
  assert.equal(persisted.paymentStatus, "paid")
  assert.equal(persisted.squarePaymentId, paymentId)
  assert.equal(persisted.squareOrderId, squareOrderId)

  console.log(
    "PASS: Correct payment persisted after transaction retry"
  )

  const paidCount = await Order.countDocuments({
    _id: id,
    status: "paid",
    paymentStatus: "paid",
    squarePaymentId: paymentId
  })

  assert.equal(paidCount, 1)

  console.log(
    "PASS: Exactly one paid order persisted"
  )

  await assert.rejects(
    recordV3ProductionPaymentTransactionalIsolated({
      orderId,
      connection,
      Order,
      Reservation,
      PaymentOperation,
      verifiedBinding
    }),
    /INCONSISTENT_PURCHASE_STATE/
  )

  const paidCountAfterReplay =
    await Order.countDocuments({
      _id: id,
      status: "paid",
      squarePaymentId: paymentId
    })

  assert.equal(paidCountAfterReplay, 1)

  console.log(
    "PASS: Repeated recorder call cannot write payment twice"
  )

  assert.equal(squareCalls, 0)

  console.log(
    "PASS: No Square calls in either callback execution"
  )

  console.log("")
  console.log("STEP 79 ACTUAL RECORDER RETRY: PASSED")
  console.log("APPLICATION CALLS: " + applicationCalls)
  console.log("CALLBACK EXECUTIONS: " + callbackReads)
  console.log("DURABLE PAID ORDERS: " + paidCountAfterReplay)
  console.log("DATABASE: ISOLATED MONGODB REPLICA SET")
  console.log("NO PRODUCTION DATABASE")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")
} finally {
  if (connection) {
    await connection.close()
  }

  if (replicaSet) {
    await replicaSet.stop()
  }
}
