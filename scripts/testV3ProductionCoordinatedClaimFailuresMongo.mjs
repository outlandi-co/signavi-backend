import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import { coordinateV3ProductionClaimIsolated } from "../utils/coordinateV3ProductionClaimIsolated.js"

process.env.NODE_ENV = "test"

const key = id => `signavi-v3-production-purchase-${id}`

const ids = {
  secondWrite: "507f191e810c19729de860f1",
  firstWrite: "507f191e810c19729de860f2",
  mismatch: "507f191e810c19729de860f3"
}

let mongo

async function createPair(id, operationKey = key(id)) {
  await Reservation.create({
    environment: "production",
    orderId: id,
    purchaseKey: key(id),
    claimedByDocumentType: "order",
    claimedByDocumentId: id,
    idempotencyKey: key(id),
    status: "reserved",
    attemptClaimedAt: null
  })

  await PaymentOperation.create({
    environment: "production",
    orderId: id,
    idempotencyKey: operationKey,
    amountCents: 100,
    status: "pending",
    squareCreationAttemptClaimedAt: null
  })
}

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

  // TEST 1: Operation claimed, reservation write fails.
  await createPair(ids.secondWrite)

  const failingReservation = {
    findOne: (...args) => Reservation.findOne(...args),
    findOneAndUpdate: async () => {
      throw new Error("INJECTED_RESERVATION_WRITE_FAILURE")
    }
  }

  await assert.rejects(
    coordinateV3ProductionClaimIsolated({
      orderId: ids.secondWrite,
      Reservation: failingReservation,
      PaymentOperation
    }),
    /INJECTED_RESERVATION_WRITE_FAILURE/
  )

  const held = await PaymentOperation.findOne({
    orderId: ids.secondWrite
  }).lean()

  const unclaimed = await Reservation.findOne({
    orderId: ids.secondWrite
  }).lean()

  assert.equal(held.status, "reconciliation_required")
  assert.ok(held.squareCreationAttemptClaimedAt)
  assert.equal(unclaimed.status, "reserved")
  assert.equal(unclaimed.attemptClaimedAt, null)

  console.log("PASS: Second-write failure preserves operation hold")
  console.log("PASS: Reservation remains unclaimed")

  const replay = await coordinateV3ProductionClaimIsolated({
    orderId: ids.secondWrite,
    Reservation,
    PaymentOperation
  })

  assert.equal(replay.blocked, true)
  assert.equal(replay.squareCreationAuthorized, false)

  console.log("PASS: Retry after second-write failure blocked")

  // TEST 2: Operation write fails before reservation claim.
  await createPair(ids.firstWrite)

  const failingOperation = {
    findOne: (...args) => PaymentOperation.findOne(...args),
    findOneAndUpdate: async () => {
      throw new Error("INJECTED_OPERATION_WRITE_FAILURE")
    }
  }

  await assert.rejects(
    coordinateV3ProductionClaimIsolated({
      orderId: ids.firstWrite,
      Reservation,
      PaymentOperation: failingOperation
    }),
    /INJECTED_OPERATION_WRITE_FAILURE/
  )

  const operation = await PaymentOperation.findOne({
    orderId: ids.firstWrite
  }).lean()

  const reservation = await Reservation.findOne({
    orderId: ids.firstWrite
  }).lean()

  assert.equal(operation.status, "pending")
  assert.equal(operation.squareCreationAttemptClaimedAt, null)
  assert.equal(reservation.status, "reserved")
  assert.equal(reservation.attemptClaimedAt, null)

  console.log("PASS: First-write failure leaves both records unchanged")

  // TEST 3: Conflicting identities must not initiate claims.
  await createPair(
    ids.mismatch,
    "signavi-v3-production-conflicting-identity"
  )

  const mismatch = await coordinateV3ProductionClaimIsolated({
    orderId: ids.mismatch,
    Reservation,
    PaymentOperation
  })

  assert.equal(mismatch.coordinated, false)
  assert.equal(mismatch.blocked, true)
  assert.equal(mismatch.squareCreationAuthorized, false)

  const mismatchOperation = await PaymentOperation.findOne({
    orderId: ids.mismatch
  }).lean()

  const mismatchReservation = await Reservation.findOne({
    orderId: ids.mismatch
  }).lean()

  assert.equal(mismatchOperation.status, "pending")
  assert.equal(mismatchReservation.status, "reserved")

  console.log("PASS: Mismatched identity fails closed")

  assert.equal(await Reservation.countDocuments(), 3)
  assert.equal(await PaymentOperation.countDocuments(), 3)

  console.log("PASS: No duplicate records created")

  console.log("")
  console.log("STEP 44 DATABASE FAILURE TESTS: PASSED")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")
  console.log("NO AUTOMATIC RETRIES")

} finally {
  await mongoose.disconnect()

  if (mongo) await mongo.stop()
}
