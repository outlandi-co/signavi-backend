import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js"

import PaymentOperation from
  "../models/SmartShippingV3PaymentOperation.js"

import {
  coordinateV3ProductionClaimIsolated
} from "../utils/coordinateV3ProductionClaimIsolated.js"

process.env.NODE_ENV = "test"

const orderId = "507f191e810c19729de860ea"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

let mongo

try {
  mongo = await MongoMemoryServer.create()
  const uri = mongo.getUri()

  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/)

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  })

  await Promise.all([
    Reservation.init(),
    PaymentOperation.init()
  ])

  const createPair = async id => {
    const key = `signavi-v3-production-purchase-${id}`

    await Reservation.create({
      environment: "production",
      orderId: id,
      purchaseKey: key,
      idempotencyKey: key,
      claimedByDocumentType: "order",
      claimedByDocumentId: id,
      status: "reserved",
      attemptClaimedAt: null
    })

    await PaymentOperation.create({
      orderId: id,
      idempotencyKey: key,
      environment: "production",
      amountCents: 100,
      status: "pending",
      squareCreationAttemptClaimedAt: null
    })
  }

  await createPair(orderId)

  const context = {
    orderId,
    Reservation,
    PaymentOperation
  }

  const results = await Promise.all(
    Array.from({ length: 50 }, () =>
      coordinateV3ProductionClaimIsolated(context)
    )
  )

  assert.equal(results.filter(x => x.coordinated).length, 1)
  assert.equal(results.filter(x => x.blocked).length, 49)

  console.log("PASS: 50 competitors, one coordinated claim")
  console.log("PASS: 49 competing claims blocked")

  const reservation = await Reservation.findOne({ orderId })
  const operation = await PaymentOperation.findOne({ orderId })

  assert.equal(reservation.status, "claim_pending")
  assert.ok(reservation.attemptClaimedAt)
  assert.equal(operation.status, "reconciliation_required")
  assert.ok(operation.squareCreationAttemptClaimedAt)

  console.log("PASS: Both claim states persisted")

  const replay = await coordinateV3ProductionClaimIsolated(context)
  assert.equal(replay.blocked, true)

  console.log("PASS: Repeated claim blocked")

  const interruptedOrderId = "507f191e810c19729de860ed"
  await createPair(interruptedOrderId)

  await assert.rejects(
    coordinateV3ProductionClaimIsolated({
      ...context,
      orderId: interruptedOrderId,
      afterOperationClaim: async () => {
        throw new Error("SIMULATED_PROCESS_INTERRUPTION")
      }
    }),
    /SIMULATED_PROCESS_INTERRUPTION/
  )

  const interruptedOperation =
    await PaymentOperation.findOne({
      orderId: interruptedOrderId
    })

  const interruptedReservation =
    await Reservation.findOne({
      orderId: interruptedOrderId
    })

  assert.equal(
    interruptedOperation.status,
    "reconciliation_required"
  )
  assert.ok(interruptedOperation.squareCreationAttemptClaimedAt)
  assert.equal(interruptedReservation.status, "reserved")

  console.log("PASS: Interruption preserves operation hold")

  const retry = await coordinateV3ProductionClaimIsolated({
    ...context,
    orderId: interruptedOrderId
  })

  assert.equal(retry.blocked, true)
  console.log("PASS: Interrupted claim cannot be retried")

  const mode = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = "production"

    await assert.rejects(
      coordinateV3ProductionClaimIsolated(context),
      /ISOLATED_TEST_ONLY/
    )

    console.log("PASS: Production execution disabled")
  } finally {
    process.env.NODE_ENV = mode
  }

  assert.ok(results.every(x =>
    x.squareCreationAuthorized === false &&
    x.retryAuthorized === false
  ))

  console.log("PASS: No claim authorizes Square execution")

  console.log("")
  console.log("COORDINATED MONGODB CLAIM TEST: PASSED")
  console.log("NO EXTERNAL DATABASE")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")

} finally {
  await mongoose.disconnect()

  if (mongo) await mongo.stop()
}
