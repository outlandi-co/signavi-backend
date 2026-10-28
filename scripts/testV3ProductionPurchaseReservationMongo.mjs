import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js"

import {
  reserveV3ProductionPurchaseIsolated
} from "../utils/reserveV3ProductionPurchaseIsolated.js"

process.env.NODE_ENV = "test"

const orderId = "507f191e810c19729de860ea"
const invoiceId = "507f191e810c19729de860eb"

const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

let mongo = null

try {
  mongo = await MongoMemoryServer.create()

  const uri = mongo.getUri()

  // Never use an external MongoDB connection for this test.
  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/)

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  })

  await Reservation.init()

  const indexes = await Reservation.collection.indexes()

  const uniqueIndexes = [
    "unique_production_v3_purchase",
    "unique_production_v3_order",
    "unique_production_v3_idempotency"
  ]

  for (const name of uniqueIndexes) {
    const index = indexes.find(x => x.name === name)

    assert.ok(index, `Missing MongoDB index: ${name}`)
    assert.equal(index.unique, true)

    console.log("PASS: MongoDB unique index:", name)
  }

  const order = {
    _id: orderId,
    squareEnvironment: "production"
  }

  const association = {
    orderId,
    invoiceId,
    environment: "production"
  }

  const common = {
    orderId,

    loadOrder: async id =>
      id === orderId ? order : null,

    loadAssociation: async query =>
      query.orderId === orderId &&
      query.invoiceId === invoiceId &&
      query.environment === "production"
        ? association
        : null,

    Reservation
  }

  const attempts = Array.from(
    { length: 50 },
    (_, i) => ({
      documentType: i % 2 === 0 ? "order" : "invoice",
      documentId: i % 2 === 0 ? orderId : invoiceId
    })
  )

  const results = await Promise.all(
    attempts.map(attempt =>
      reserveV3ProductionPurchaseIsolated({
        ...common,
        ...attempt
      })
    )
  )

  const winners = results.filter(x => x.reserved)
  const blocked = results.filter(x => x.blocked)

  assert.equal(winners.length, 1)
  assert.equal(blocked.length, 49)

  console.log("PASS: 50 MongoDB reservation attempts")
  console.log("PASS: Exactly one reservation winner")
  console.log("PASS: 49 competing attempts blocked")

  const count = await Reservation.countDocuments({
    environment: "production",
    purchaseKey
  })

  assert.equal(count, 1)

  console.log("PASS: Exactly one MongoDB reservation document")

  const saved = await Reservation.findOne({
    purchaseKey
  }).lean()

  assert.equal(saved.purchaseKey, purchaseKey)
  assert.equal(saved.orderId.toString(), orderId)
  assert.equal(saved.idempotencyKey, purchaseKey)

  console.log("PASS: Canonical purchase identity persisted")
  console.log("PASS: Idempotency identity persisted")

  const replay = await reserveV3ProductionPurchaseIsolated({
    ...common,
    documentType: "invoice",
    documentId: invoiceId
  })

  assert.equal(replay.blocked, true)

  console.log("PASS: Invoice replay blocked by MongoDB")

  const finalCount = await Reservation.countDocuments()

  assert.equal(finalCount, 1)

  console.log("PASS: No duplicate reservation documents")

  console.log("")
  console.log("REAL MONGODB PRODUCTION RESERVATION TEST: PASSED")
  console.log("ATTEMPTS: 50")
  console.log("WINNERS: 1")
  console.log("BLOCKED: 49")
  console.log("DATABASE: ISOLATED IN-MEMORY MONGODB")
  console.log("NO ATLAS CONNECTION")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")

} finally {
  await mongoose.disconnect()

  if (mongo) {
    await mongo.stop()
  }
}
