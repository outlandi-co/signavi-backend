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
    ["order", "invoice"].flatMap(documentType =>
      Array.from({ length: 25 }, () =>
        reserve({
          documentType,
          documentId,
          environment: "sandbox",
          amountCents: 15000
        })
      )
    )
  )

  const winners = attempts.filter(x => x.reserved)
  const blocked = attempts.filter(x => !x.reserved)

  assert.equal(attempts.length, 50)
  assert.equal(winners.length, 2)
  assert.equal(blocked.length, 48)

  assert.deepEqual(
    winners.map(x => x.documentType).sort(),
    ["invoice", "order"]
  )

  assert.equal(
    new Set(winners.map(x => x.idempotencyKey)).size,
    2
  )

  assert.ok(
    blocked.every(x =>
      x.reason === "payment_identity_already_reserved" &&
      x.squareRequestAuthorized === false
    )
  )

  assert.ok(
    winners.every(x => x.squareRequestAuthorized === false)
  )

  const records = await Reservation.find({
    documentId,
    environment: "sandbox"
  }).lean()

  assert.equal(records.length, 2)

  assert.ok(
    records.every(x =>
      x.status === "reconciliation_required" &&
      x.attemptClaimedAt === null
    )
  )

  console.log("TOTAL CONCURRENT ATTEMPTS: 50")
  console.log("ORDER RESERVATIONS: 1")
  console.log("INVOICE RESERVATIONS: 1")
  console.log("DUPLICATE ATTEMPTS BLOCKED: 48")
  console.log("DATABASE RECORDS: 2")
  console.log("IDEMPOTENCY KEYS: DISTINCT")
  console.log("UNCERTAIN OUTCOMES: PRESERVED")
  console.log("SQUARE AUTHORIZATION: DISABLED")
  console.log("CROSS-WORKFLOW ISOLATION TEST PASSED")
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}