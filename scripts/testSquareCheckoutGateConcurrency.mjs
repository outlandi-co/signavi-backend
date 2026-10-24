import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import Reservation from "../models/SquarePaymentCreationReservation.js"
import {
  prepareSquarePaymentCreation
} from "../utils/prepareSquarePaymentCreation.js"

process.env.NODE_ENV = "test"
process.env.SQUARE_RESERVATION_INTEGRATION_TEST = "true"

const source = readFileSync(
  new URL("../routes/square.js", import.meta.url),
  "utf8"
)

const startMarker =
  "    // Dedicated database-backed integration test gate."
const endMarker =
  "    // Block legacy Square creation"

const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker, start)

assert.ok(start >= 0, "Route integration gate missing")
assert.ok(end > start, "Route legacy guard missing")

const gate = source.slice(start, end)

const mongo = await MongoMemoryServer.create()
const orderId = new mongoose.Types.ObjectId()
const amountCents = 100

try {
  await mongoose.connect(mongo.getUri(), {
    dbName: "signavi_reservation_isolated_test"
  })

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_reservation_isolated_test"
  )

  await Reservation.init()

  const executeGate = async () => {
    let responseCode = null
    let responseBody = null

    await runInNewContext(
      `(async function () {
        ${gate}
        return undefined
      })()`,
      {
        process: {
          env: {
            NODE_ENV: "test",
            SQUARE_RESERVATION_INTEGRATION_TEST: "true"
          }
        },
        mongoose,
        prepareSquarePaymentCreation,
        record: { _id: orderId },
        squareMode: "sandbox",
        cents: amountCents,
        res: {
          status(code) {
            responseCode = code
            return this
          },
          json(body) {
            responseBody = body
            return body
          }
        }
      },
      { timeout: 10000 }
    )

    return {
      responseCode,
      responseBody
    }
  }

  const outcomes = await Promise.all(
    Array.from({ length: 12 }, executeGate)
  )

  assert.equal(outcomes.length, 12)

  for (const outcome of outcomes) {
    assert.equal(outcome.responseCode, 423)
    assert.equal(
      outcome.responseBody.squareRequestAuthorized,
      false
    )
  }

  const firstWins = outcomes.filter(
    x => x.responseBody.reason ===
      "square_execution_not_authorized"
  )

  const duplicates = outcomes.filter(
    x => x.responseBody.reason ===
      "payment_creation_already_reserved"
  )

  assert.equal(firstWins.length, 1)
  assert.equal(duplicates.length, 11)

  const persisted = await Reservation.find({
    orderId,
    environment: "sandbox"
  }).lean()

  assert.equal(persisted.length, 1)
  assert.equal(
    persisted[0].status,
    "reconciliation_required"
  )
  assert.equal(persisted[0].amountCents, 100)

  console.log("12 CONCURRENT CHECKOUT GATE ATTEMPTS")
  console.log("1 DURABLE RESERVATION: PASS")
  console.log("11 DUPLICATES BLOCKED: PASS")
  console.log("12 SQUARE REQUESTS BLOCKED: PASS")
  console.log("PERSISTED RECONCILIATION STATUS: PASS")
  console.log("NO EXTERNAL DATABASE OR SQUARE REQUESTS")
  console.log("CHECKOUT GATE CONCURRENCY TEST PASSED")
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}