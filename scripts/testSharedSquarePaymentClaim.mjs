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

  const { claimSharedSquarePaymentAttempt: claimPayment } =
    await import("../utils/claimSharedSquarePaymentAttempt.js")

  await Reservation.init()

  const documentId = new mongoose.Types.ObjectId()
  const results = []

  for (const documentType of ["order", "invoice"]) {
    const reserved = await reserve({
      documentType,
      documentId,
      environment: "sandbox",
      amountCents: 15000
    })

    assert.equal(reserved.reserved, true)
    assert.equal(reserved.squareRequestAuthorized, false)

    const record = await Reservation.findOne({
      documentType,
      documentId,
      environment: "sandbox"
    }).lean()

    assert.ok(record)

    const inputs = {
      documentType,
      documentId,
      environment: "sandbox",
      amountCents: record.amountCents,
      owner: record.owner,
      idempotencyKey: record.idempotencyKey
    }

    const wrongOwner = await claimPayment({
      ...inputs,
      owner: "invalid-owner"
    })

    assert.equal(wrongOwner.claimed, false)

    const wrongAmount = await claimPayment({
      ...inputs,
      amountCents: 99999
    })

    assert.equal(wrongAmount.claimed, false)

    const attempts = await Promise.all(
      Array.from({ length: 25 }, () =>
        claimPayment(inputs)
      )
    )

    const winners = attempts.filter(x => x.claimed)
    const blocked = attempts.filter(x => !x.claimed)

    assert.equal(winners.length, 1)
    assert.equal(blocked.length, 24)

    assert.ok(
      attempts.every(x =>
        x.squareRequestAuthorized === false
      )
    )

    assert.equal(winners[0].paymentCreated, false)
    assert.ok(winners[0].claimedAt)

    const saved = await Reservation.findOne({
      documentType,
      documentId,
      environment: "sandbox"
    }).lean()

    assert.ok(saved.attemptClaimedAt)
    assert.equal(saved.status, "reconciliation_required")

    const repeated = await claimPayment(inputs)

    assert.equal(repeated.claimed, false)

    results.push({
      documentType,
      idempotencyKey: saved.idempotencyKey
    })

    console.log(
      `${documentType.toUpperCase()}: 1 CLAIMED, 24 BLOCKED`
    )
  }

  assert.equal(
    new Set(results.map(x => x.idempotencyKey)).size,
    2
  )

  const records = await Reservation.find({
    documentId,
    environment: "sandbox"
  }).lean()

  assert.equal(records.length, 2)

  assert.ok(
    records.every(x =>
      x.status === "reconciliation_required" &&
      x.attemptClaimedAt !== null
    )
  )

  console.log("WRONG OWNER: BLOCKED")
  console.log("WRONG AMOUNT: BLOCKED")
  console.log("REPEATED CLAIM: BLOCKED")
  console.log("DURABLE CLAIM: PRESERVED")
  console.log("ORDER/INVOICE IDENTITIES: DISTINCT")
  console.log("SQUARE AUTHORIZATION: DISABLED")
  console.log("SHARED PAYMENT CLAIM TEST PASSED")
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}