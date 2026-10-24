import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import Reservation from "../models/SharedSquarePaymentReservation.js"
import {
  reserveSharedSquarePaymentIdentity
} from "../utils/reserveSharedSquarePaymentIdentity.js"

process.env.NODE_ENV = "test"

const mongo = await MongoMemoryServer.create()

try {
  await mongoose.connect(mongo.getUri(), {
    dbName: "signavi_reservation_isolated_test"
  })

  await Reservation.init()

  const documentId = new mongoose.Types.ObjectId()

  for (const documentType of ["order", "invoice"]) {
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        reserveSharedSquarePaymentIdentity({
          documentType,
          documentId,
          environment: "sandbox",
          amountCents: 100
        })
      )
    )

    assert.equal(
      outcomes.filter(x => x.reserved).length,
      1
    )

    assert.equal(
      outcomes.filter(x => !x.reserved).length,
      11
    )

    assert.ok(
      outcomes.every(
        x => x.squareRequestAuthorized === false
      )
    )

    console.log(`${documentType.toUpperCase()}: 1 RESERVED, 11 BLOCKED`)
  }

  const records = await Reservation.find({
    documentId,
    environment: "sandbox"
  }).lean()

  assert.equal(records.length, 2)

  assert.equal(
    new Set(records.map(x => x.idempotencyKey)).size,
    2
  )

  assert.ok(
    records.every(
      x =>
        x.status === "reconciliation_required" &&
        x.attemptClaimedAt === null
    )
  )

  console.log("ORDER AND INVOICE IDENTITIES: DISTINCT")
  console.log("DETERMINISTIC IDEMPOTENCY KEYS: DISTINCT")
  console.log("UNCERTAIN OUTCOMES: PRESERVED")
  console.log("SQUARE AUTHORIZATION: DISABLED")
  console.log("NO EXTERNAL DATABASE OR SQUARE REQUESTS")
  console.log("SHARED PAYMENT IDENTITY TEST PASSED")
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}