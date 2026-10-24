import assert from "node:assert/strict"
import mongoose from "mongoose"
import Reservation from "../models/SquarePaymentCreationReservation.js"
import {
  acquireSquarePaymentCreationReservation
} from "../utils/acquireSquarePaymentCreationReservation.js"

const orderId = "507f1f77bcf86cd799439011"
const originalCreate = Reservation.create
const originalReadyState = Object.getOwnPropertyDescriptor(
  mongoose.connection, "readyState"
)

let mode = "success"
let writes = 0

try {
  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    value: 1
  })

  Reservation.create = async data => {
    writes++

    if (mode === "duplicate") {
      const error = new Error("Mock duplicate key")
      error.code = 11000
      throw error
    }

    if (mode === "failure") {
      throw new Error("Mock database failure")
    }

    assert.equal(String(data.orderId), orderId)
    assert.equal(data.environment, "sandbox")
    assert.equal(data.amountCents, 100)
    assert.equal(data.status, "reconciliation_required")

    return data
  }

  const first = await acquireSquarePaymentCreationReservation({
    orderId,
    environment: "sandbox",
    amountCents: 100
  })

  assert.equal(first.reserved, true)
  assert.equal(first.squareRequestAuthorized, false)
  assert.equal(first.paymentCreated, false)
  assert.equal(
    first.idempotencyKey,
    `signavi-sandbox-${orderId}`
  )
  console.log("VALID RESERVATION: PASS")

  mode = "duplicate"

  const duplicate =
    await acquireSquarePaymentCreationReservation({
      orderId,
      environment: "sandbox",
      amountCents: 100
    })

  assert.equal(duplicate.reserved, false)
  assert.equal(
    duplicate.reason,
    "payment_creation_already_reserved"
  )
  assert.equal(duplicate.squareRequestAuthorized, false)
  console.log("DUPLICATE RESERVATION: BLOCKED")

  const writesBeforeInvalid = writes

  await assert.rejects(
    acquireSquarePaymentCreationReservation({
      orderId: "invalid",
      environment: "sandbox",
      amountCents: 100
    }),
    /Invalid Square payment reservation/
  )

  await assert.rejects(
    acquireSquarePaymentCreationReservation({
      orderId,
      environment: "invalid",
      amountCents: 100
    }),
    /Invalid Square payment reservation/
  )

  await assert.rejects(
    acquireSquarePaymentCreationReservation({
      orderId,
      environment: "sandbox",
      amountCents: 0
    }),
    /Invalid Square payment reservation/
  )

  assert.equal(writes, writesBeforeInvalid)
  console.log("INVALID INPUTS: REJECTED")

  mode = "failure"

  await assert.rejects(
    acquireSquarePaymentCreationReservation({
      orderId,
      environment: "sandbox",
      amountCents: 100
    }),
    /Mock database failure/
  )
  console.log("DATABASE FAILURE: REJECTED")

  const indexes = Reservation.schema.indexes()

  for (const expected of [
    { orderId: 1, environment: 1 },
    { environment: 1, idempotencyKey: 1 }
  ]) {
    assert.ok(
      indexes.some(([keys, options]) =>
        JSON.stringify(keys) === JSON.stringify(expected) &&
        options.unique === true
      ),
      `Missing unique index: ${JSON.stringify(expected)}`
    )
  }

  console.log("UNIQUE INDEX DEFINITIONS: PASS")
  console.log("ALL RESERVATION UNIT TESTS PASSED")
  console.log("NO REAL MONGODB OR SQUARE REQUESTS")
} finally {
  Reservation.create = originalCreate

  if (originalReadyState) {
    Object.defineProperty(
      mongoose.connection,
      "readyState",
      originalReadyState
    )
  } else {
    delete mongoose.connection.readyState
  }
}