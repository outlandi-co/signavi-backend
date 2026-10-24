import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import Reservation from "../models/SquarePaymentCreationReservation.js"
import {
  prepareSquarePaymentCreation
} from "../utils/prepareSquarePaymentCreation.js"
import {
  claimSquarePaymentCreationAttempt
} from "../utils/claimSquarePaymentCreationAttempt.js"

process.env.NODE_ENV = "test"

const mongo = await MongoMemoryServer.create()
const orderId = new mongoose.Types.ObjectId()
const environment = "sandbox"
const amountCents = 100

try {
  await mongoose.connect(mongo.getUri(), {
    dbName: "signavi_reservation_isolated_test"
  })

  await Reservation.init()

  const preparation = await prepareSquarePaymentCreation({
    orderId,
    environment,
    amountCents
  })

  assert.equal(preparation.prepared, true)
  assert.equal(preparation.squareRequestAuthorized, false)

  const wrongOwner = await claimSquarePaymentCreationAttempt({
    orderId,
    environment,
    amountCents,
    owner: "wrong-owner"
  })

  assert.equal(wrongOwner.claimed, false)

  const attempts = await Promise.all(
    Array.from({ length: 12 }, () =>
      claimSquarePaymentCreationAttempt({
        orderId,
        environment,
        amountCents,
        owner: preparation.owner
      })
    )
  )

  assert.equal(attempts.filter(x => x.claimed).length, 1)
  assert.equal(attempts.filter(x => !x.claimed).length, 11)
  assert.ok(
    attempts.every(x => x.squareRequestAuthorized === false)
  )

  const persisted = await Reservation.findOne({
    orderId,
    environment
  }).lean()

  assert.ok(persisted.creationAttemptClaimedAt)
  assert.equal(persisted.status, "reconciliation_required")

  const repeat = await claimSquarePaymentCreationAttempt({
    orderId,
    environment,
    amountCents,
    owner: preparation.owner
  })

  assert.equal(repeat.claimed, false)

  console.log("WRONG OWNER: BLOCKED")
  console.log("12 CONCURRENT CLAIMS: 1 SUCCESS, 11 BLOCKED")
  console.log("REPEATED CLAIM: BLOCKED")
  console.log("RECONCILIATION STATUS: PRESERVED")
  console.log("SQUARE AUTHORIZATION: DISABLED")
  console.log("NO EXTERNAL DATABASE OR SQUARE REQUESTS")
  console.log("ATOMIC PAYMENT ATTEMPT CLAIM TEST PASSED")
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}