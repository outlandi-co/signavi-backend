import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import Reservation from "../models/SquarePaymentCreationReservation.js"
import {
  prepareSquarePaymentCreation
} from "../utils/prepareSquarePaymentCreation.js"

if (mongoose.connection.readyState !== 0) {
  throw new Error("STOP: Existing database connection detected.")
}

let server

try {
  server = await MongoMemoryServer.create({
    instance: {
      ip: "127.0.0.1",
      dbName: "signavi_payment_preparation_test"
    }
  })

  const uri = server.getUri()
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/)

  await mongoose.connect(uri, {
    dbName: "signavi_payment_preparation_test",
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()

  const orderId = "507f1f77bcf86cd799439088"

  const first = await prepareSquarePaymentCreation({
    orderId,
    environment: "sandbox",
    amountCents: 100
  })

  assert.equal(first.prepared, true)
  assert.equal(first.squareRequestAuthorized, false)
  assert.equal(first.paymentCreated, false)
  console.log("FIRST PREPARATION: PASS")

  const second = await prepareSquarePaymentCreation({
    orderId,
    environment: "sandbox",
    amountCents: 100
  })

  assert.equal(second.prepared, false)
  assert.equal(second.squareRequestAuthorized, false)
  console.log("DUPLICATE PREPARATION: BLOCKED")

  const count = await Reservation.countDocuments({
    orderId
  })

  assert.equal(count, 1)

  const record = await Reservation.findOne({
    orderId
  }).lean()

  assert.equal(record.status, "reconciliation_required")
  assert.equal(record.amountCents, 100)

  console.log("PERSISTED RESERVATION: VERIFIED")
  console.log("NO SQUARE REQUESTS")
  console.log("ALL PAYMENT PREPARATION TESTS PASSED")
} finally {
  await mongoose.disconnect()

  if (server) {
    await server.stop()
  }
}