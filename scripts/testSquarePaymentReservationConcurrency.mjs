import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import Reservation from "../models/SquarePaymentCreationReservation.js"
import {
  acquireSquarePaymentCreationReservation
} from "../utils/acquireSquarePaymentCreationReservation.js"

if (mongoose.connection.readyState !== 0) {
  throw new Error("STOP: Existing MongoDB connection detected.")
}

let server

try {
  server = await MongoMemoryServer.create({
    instance: {
      ip: "127.0.0.1",
      dbName: "signavi_reservation_isolated_test"
    }
  })

  const uri = server.getUri()

  assert.match(
    uri,
    /^mongodb:\/\/127\.0\.0\.1:/
  )

  await mongoose.connect(uri, {
    dbName: "signavi_reservation_isolated_test",
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()

  const indexes = await Reservation.collection.indexes()

  for (const fields of [
    { orderId: 1, environment: 1 },
    { environment: 1, idempotencyKey: 1 }
  ]) {
    assert.ok(
      indexes.some(index =>
        index.unique === true &&
        JSON.stringify(index.key) === JSON.stringify(fields)
      ),
      `Missing actual MongoDB unique index: ${JSON.stringify(fields)}`
    )
  }

  console.log("REAL MONGODB UNIQUE INDEXES: PASS")

  const orderId = "507f1f77bcf86cd799439099"

  const attempts = await Promise.all(
    Array.from({ length: 12 }, () =>
      acquireSquarePaymentCreationReservation({
        orderId,
        environment: "sandbox",
        amountCents: 100
      })
    )
  )

  const acquired = attempts.filter(r => r.reserved === true)
  const blocked = attempts.filter(r => r.reserved === false)

  assert.equal(acquired.length, 1)
  assert.equal(blocked.length, 11)

  for (const result of attempts) {
    assert.equal(result.squareRequestAuthorized, false)
    assert.equal(result.paymentCreated, false)
  }

  const records = await Reservation.find({
    orderId
  }).lean()

  assert.equal(records.length, 1)
  assert.equal(records[0].status, "reconciliation_required")
  assert.equal(records[0].amountCents, 100)

  console.log("12 CONCURRENT ATTEMPTS: PASS")
  console.log("SUCCESSFUL RESERVATIONS: 1")
  console.log("BLOCKED DUPLICATES: 11")
  console.log("DURABLE RECORD COUNT: 1")
  console.log("NO SQUARE REQUESTS")
  console.log("ISOLATED MONGODB CONCURRENCY TEST PASSED")
} finally {
  await mongoose.disconnect()

  if (server) {
    await server.stop()
  }
}