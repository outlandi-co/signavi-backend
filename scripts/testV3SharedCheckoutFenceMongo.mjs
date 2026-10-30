import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SquarePaymentCreationReservation.js"

import {
  acquireSquarePaymentCreationReservation
} from "../utils/acquireSquarePaymentCreationReservation.js"

import {
  acquireV3SharedCheckoutFence
} from "../utils/acquireV3SharedCheckoutFence.js"

let replica

const newId = () => String(new mongoose.Types.ObjectId())

const legacy = id =>
  acquireSquarePaymentCreationReservation({
    orderId: id,
    environment: "production",
    amountCents: 2750
  })

const v3 = id =>
  acquireV3SharedCheckoutFence({
    orderId: id,
    amountCents: 2750
  })

async function assertSingleRecord(id) {
  const records = await Reservation.find({
    orderId: id,
    environment: "production"
  }).lean()

  assert.equal(records.length, 1)
  assert.equal(records[0].amountCents, 2750)
  assert.equal(records[0].status, "reconciliation_required")
  assert.equal(
    records[0].idempotencyKey,
    `signavi-production-${id}`
  )

  return records[0]
}

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replica.getUri(), {
    dbName: "signavi_v3_shared_fence_isolated",
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()

  console.log("PASS: Shared unique index initialized")

  // A. Existing legacy ownership blocks V3 ownership.
  const legacyFirstId = newId()

  const legacyFirst = await legacy(legacyFirstId)
  const v3Blocked = await v3(legacyFirstId)

  assert.equal(legacyFirst.reserved, true)
  assert.equal(v3Blocked.reserved, false)
  assert.equal(v3Blocked.squareRequestAuthorized, false)

  await assertSingleRecord(legacyFirstId)

  console.log("PASS: Legacy-first prevents V3 reservation")

  // B. Existing V3 ownership blocks new legacy reservation.
  const v3FirstId = newId()

  const v3First = await v3(v3FirstId)
  const legacyBlocked = await legacy(v3FirstId)

  assert.equal(v3First.reserved, true)
  assert.equal(v3First.squareRequestAuthorized, false)
  assert.equal(legacyBlocked.reserved, false)

  await assertSingleRecord(v3FirstId)

  console.log("PASS: V3-first prevents legacy reservation")

  // C. Six requests from each workflow compete simultaneously.
  const concurrentId = newId()

  const contenders = Array.from({ length: 12 }, (_, index) =>
    index % 2 === 0
      ? legacy(concurrentId)
      : v3(concurrentId)
  )

  const outcomes = await Promise.all(contenders)

  const winners = outcomes.filter(x => x.reserved === true)
  const denied = outcomes.filter(x => x.reserved !== true)

  assert.equal(winners.length, 1)
  assert.equal(denied.length, 11)

  assert.equal(
    outcomes.every(x => x.squareRequestAuthorized === false),
    true
  )

  await assertSingleRecord(concurrentId)

  console.log("PASS: 12 cross-workflow attempts, exactly one reservation")

  // D. Repeats are denied without replacing the original owner.
  const previous = await assertSingleRecord(concurrentId)

  const replay = await v3(concurrentId)

  assert.equal(replay.reserved, false)

  const after = await assertSingleRecord(concurrentId)

  assert.equal(after.owner, previous.owner)

  console.log("PASS: Existing owner cannot be overwritten")

  // E. Invalid identity is rejected before database changes.
  const invalid = await acquireV3SharedCheckoutFence({
    orderId: "invalid",
    amountCents: 2750
  })

  assert.equal(invalid.reserved, false)
  assert.equal(invalid.squareRequestAuthorized, false)

  console.log("PASS: Invalid checkout identity fails closed")

  console.log("===== STEP 376 SHARED FENCE TESTS PASSED =====")
  console.log("ONE COMMON RESERVATION COLLECTION")
  console.log("ZERO SQUARE REQUESTS")
  console.log("PRODUCTION ROUTES NOT ACTIVATED")

} finally {
  await mongoose.disconnect()
  if (replica) await replica.stop()
}