import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  initializeV3ProductionCheckoutAtomic
} from "../utils/initializeV3ProductionCheckoutAtomic.js"

let replica

const newId = () => String(new mongoose.Types.ObjectId())

const keyFor = id =>
  `signavi-v3-production-purchase-${id}`

const initialize = (id, amountCents) =>
  initializeV3ProductionCheckoutAtomic({
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId: id,
    amountCents
  })

async function loadPair(id) {
  return Promise.all([
    Reservation.findOne({ orderId: id }).lean(),
    PaymentOperation.findOne({ orderId: id }).lean()
  ])
}

async function assertUniquePair(id, cents) {
  assert.equal(
    await Reservation.countDocuments({ orderId: id }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: id }),
    1
  )

  const [reservation, operation] = await loadPair(id)

  assert.ok(reservation)
  assert.ok(operation)

  assert.equal(reservation.environment, "production")
  assert.equal(reservation.purchaseKey, keyFor(id))
  assert.equal(reservation.idempotencyKey, keyFor(id))
  assert.equal(reservation.status, "reserved")
  assert.equal(reservation.attemptClaimedAt, null)

  assert.equal(operation.environment, "production")
  assert.equal(operation.idempotencyKey, keyFor(id))
  assert.equal(operation.amountCents, cents)
  assert.equal(operation.status, "pending")
  assert.equal(operation.squareCreationAttemptClaimedAt, null)
  assert.equal(operation.squarePaymentLinkId, "")

  return { reservation, operation }
}

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replica.getUri(), {
    dbName: "signavi_v3_atomic_initializer_isolated",
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()
  await PaymentOperation.init()

  console.log("PASS: Isolated MongoDB and indexes initialized")

  // A. First initialization creates exactly two linked records.
  const firstId = newId()
  const first = await initialize(firstId, 2500)

  assert.equal(first.prepared, true)
  assert.equal(first.existed, false)
  await assertUniquePair(firstId, 2500)

  console.log("PASS: Transaction creates one valid reservation/operation pair")

  // B. Same identity may be inspected without resetting the pair.
  const [beforeReservation, beforeOperation] =
    await loadPair(firstId)

  const repeated = await initialize(firstId, 2500)

  assert.equal(repeated.prepared, true)
  assert.equal(repeated.existed, true)

  const [afterReservation, afterOperation] =
    await loadPair(firstId)

  assert.equal(
    String(beforeReservation._id),
    String(afterReservation._id)
  )
  assert.equal(
    String(beforeOperation._id),
    String(afterOperation._id)
  )

  await assertUniquePair(firstId, 2500)

  console.log("PASS: Reinitialization preserves existing document identities")

  // C. Different amount cannot replace the original amount.
  const conflict = await initialize(firstId, 9999)

  assert.equal(conflict.prepared, false)

  const [, afterConflict] = await loadPair(firstId)
  assert.equal(afterConflict.amountCents, 2500)

  console.log("PASS: Conflicting amount rejected without overwrite")

  // D. Claimed payment operation cannot be reset.
  await PaymentOperation.updateOne(
    { orderId: firstId },
    {
      $set: {
        status: "reconciliation_required",
        requestOwner: "trusted-owner-test-359",
        squareCreationAttemptClaimedAt: new Date(),
        squareIdempotencyKey: "existing-square-key-359"
      }
    }
  )

  const claimedReplay = await initialize(firstId, 2500)

  assert.equal(claimedReplay.prepared, false)

  const [, claimedOperation] = await loadPair(firstId)

  assert.equal(
    claimedOperation.status,
    "reconciliation_required"
  )

  assert.equal(
    claimedOperation.requestOwner,
    "trusted-owner-test-359"
  )

  assert.equal(
    claimedOperation.squareIdempotencyKey,
    "existing-square-key-359"
  )

  console.log("PASS: Claimed payment operation never reset")

  // E. Existing operation without a reservation
  // must not be silently replaced or paired with a new identity.
  const partialId = newId()

  await PaymentOperation.create({
    environment: "production",
    orderId: partialId,
    idempotencyKey: keyFor(partialId),
    amountCents: 3000,
    status: "reconciliation_required",
    requestOwner: "existing-operation-359",
    squareCreationAttemptClaimedAt: new Date()
  })

  const partial = await initialize(partialId, 3000)

  assert.equal(partial.prepared, false)

  assert.equal(
    await Reservation.countDocuments({ orderId: partialId }),
    0
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: partialId }),
    1
  )

  console.log("PASS: Preexisting partial payment state cannot be overwritten")

  // F. Concurrent initialization: one purchase identity,
  // exactly one pair, with no Square creation.
  const raceId = newId()

  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      initialize(raceId, 4100)
    )
  )

  const newlyCreated = results.filter(
    result => result.prepared && result.existed === false
  )

  assert.equal(
    newlyCreated.length,
    1,
    "Exactly one initializer must commit a new pair"
  )

  await assertUniquePair(raceId, 4100)

  console.log("PASS: 12 concurrent attempts produce exactly one purchase pair")

  // G. Rejected input never creates records.
  const invalid = await initialize("invalid-order-id", 2500)

  assert.equal(invalid.prepared, false)

  console.log("PASS: Invalid identity blocked")

  console.log("===== STEP 359: ATOMIC INITIALIZER TESTS PASSED =====")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO SQUARE CLIENT OR PAYMENT REQUESTS")

} finally {
  await mongoose.disconnect()
  if (replica) await replica.stop()
}