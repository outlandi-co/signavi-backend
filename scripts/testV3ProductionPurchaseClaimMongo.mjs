import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js"

import {
  claimV3ProductionPurchaseIsolated
} from "../utils/claimV3ProductionPurchaseIsolated.js"

process.env.NODE_ENV = "test"

const orderId = "507f191e810c19729de860ea"
const invoiceId = "507f191e810c19729de860eb"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

let mongo

try {
  mongo = await MongoMemoryServer.create()

  const uri = mongo.getUri()

  assert.match(uri, /^mongodb:\/\/127\.0\.0\.1:/)

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000
  })

  await Reservation.init()

  const inserted = await Reservation.create({
    environment: "production",
    orderId,
    purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    status: "reserved",
    idempotencyKey: purchaseKey,
    attemptClaimedAt: null
  })

  assert.equal(inserted.status, "reserved")
  console.log("PASS: Initial reservation created")

  const context = {
    orderId,
    documentType: "order",
    documentId: orderId,
    Reservation,
    loadOrder: async id =>
      id === orderId
        ? { _id: orderId, squareEnvironment: "production" }
        : null,
    loadAssociation: async query =>
      query.orderId === orderId &&
      query.invoiceId === invoiceId &&
      query.environment === "production"
        ? {
            orderId,
            invoiceId,
            environment: "production"
          }
        : null
  }

  const attempts = await Promise.all(
    Array.from({ length: 50 }, () =>
      claimV3ProductionPurchaseIsolated(context)
    )
  )

  const winners = attempts.filter(x => x.claimed)
  const blocked = attempts.filter(x => x.blocked)

  assert.equal(winners.length, 1)
  assert.equal(blocked.length, 49)

  console.log("PASS: 50 simultaneous MongoDB claim attempts")
  console.log("PASS: Exactly one claim winner")
  console.log("PASS: 49 conflicting claims blocked")

  const saved = await Reservation.findOne({
    purchaseKey
  }).lean()

  assert.equal(saved.status, "claim_pending")
  assert.ok(saved.attemptClaimedAt instanceof Date)

  console.log("PASS: Durable claim state persisted")

  const replay = await claimV3ProductionPurchaseIsolated(context)

  assert.equal(replay.blocked, true)

  console.log("PASS: Claimed reservation cannot be reclaimed")

  const invoiceAttempt =
    await claimV3ProductionPurchaseIsolated({
      ...context,
      documentType: "invoice",
      documentId: invoiceId
    })

  assert.equal(invoiceAttempt.blocked, true)

  console.log("PASS: Associated invoice cannot claim order ownership")

  await assert.rejects(
    claimV3ProductionPurchaseIsolated({
      ...context,
      documentType: "invoice",
      documentId: "507f191e810c19729de860ec"
    }),
    /PRODUCTION_ASSOCIATION_NOT_VERIFIED/
  )

  console.log("PASS: Unassociated invoice rejected")

  const count = await Reservation.countDocuments({
    purchaseKey
  })

  assert.equal(count, 1)

  console.log("PASS: Only one reservation exists")

  await assert.rejects(
    claimV3ProductionPurchaseIsolated({
      ...context,
      Reservation: {
        findOneAndUpdate: async () => {
          throw new Error("DATABASE_UNAVAILABLE")
        }
      }
    }),
    /DATABASE_UNAVAILABLE/
  )

  console.log("PASS: Database failure fails closed")

  const originalMode = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = "production"

    await assert.rejects(
      claimV3ProductionPurchaseIsolated(context),
      /ISOLATED_TEST_ONLY/
    )

    console.log("PASS: Live execution blocked")
  } finally {
    process.env.NODE_ENV = originalMode
  }

  console.log("")
  console.log("PRODUCTION ATOMIC CLAIM TEST: PASSED")
  console.log("ATTEMPTS: 50")
  console.log("WINNERS: 1")
  console.log("BLOCKED: 49")
  console.log("DATABASE: ISOLATED IN-MEMORY MONGODB")
  console.log("NO SQUARE CALLS")
  console.log("NO PAYMENT CREATION")

} finally {
  await mongoose.disconnect()

  if (mongo) {
    await mongo.stop()
  }
}
