import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

process.env.NODE_ENV = "test"

const mongo = await MongoMemoryServer.create()

try {
  await mongoose.connect(
    mongo.getUri("signavi_reservation_isolated_test")
  )

  const { default: Reservation } = await import(
    "../models/SharedSquarePaymentReservation.js"
  )

  const { reserveSharedSquarePaymentIdentity: reserve } =
    await import("../utils/reserveSharedSquarePaymentIdentity.js")

  await Reservation.init()

  const documentId = new mongoose.Types.ObjectId()

  const attempts = await Promise.all(
    Array.from({ length: 50 }, () =>
      reserve({
        documentType: "order",
        documentId,
        environment: "sandbox",
        amountCents: 15000
      })
    )
  )

  const winners = attempts.filter(x => x.reserved)
  const blocked = attempts.filter(x => !x.reserved)

  assert.equal(winners.length, 1)
  assert.equal(blocked.length, 49)

  assert.ok(
    blocked.every(x =>
      x.reason === "payment_identity_already_reserved" &&
      x.squareRequestAuthorized === false
    )
  )

  assert.equal(winners[0].squareRequestAuthorized, false)

  const records = await Reservation.find({
    documentType: "order",
    documentId,
    environment: "sandbox"
  }).lean()

  assert.equal(records.length, 1)
  assert.equal(records[0].status, "reconciliation_required")
  assert.equal(records[0].attemptClaimedAt, null)

  console.log("CONCURRENT ATTEMPTS: 50")
  console.log("SUCCESSFUL RESERVATIONS: 1")
  console.log("BLOCKED RESERVATIONS: 49")
  console.log("DATABASE RECORDS: 1")
  console.log("SQUARE AUTHORIZATION: DISABLED")
  console.log("ATOMIC RESERVATION TEST PASSED")
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}
