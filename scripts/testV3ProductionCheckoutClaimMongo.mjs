import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import {
  claimV3ProductionCheckoutReservation
} from "../utils/claimV3ProductionCheckoutReservation.js"

const orderId = new mongoose.Types.ObjectId()
const id = String(orderId)
const key = `signavi-v3-production-purchase-${id}`

let mongo

try {
  // Start an isolated, disposable MongoDB instance.
  mongo = await MongoMemoryServer.create()

  await mongoose.connect(mongo.getUri(), {
    dbName: "signavi_v3_checkout_claim_isolated_test",
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_v3_checkout_claim_isolated_test"
  )

  // Build and verify indexes before attempting claims.
  await Reservation.init()

  const indexes = await Reservation.collection.indexes()

  for (const name of [
    "unique_production_v3_purchase",
    "unique_production_v3_order",
    "unique_production_v3_idempotency"
  ]) {
    const index = indexes.find(x => x.name === name)

    assert.ok(index, `Missing index: ${name}`)
    assert.equal(index.unique, true)
  }

  console.log("PASS: 3 unique production purchase indexes verified")

  await Reservation.create({
    environment: "production",
    orderId,
    purchaseKey: key,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    status: "reserved",
    idempotencyKey: key,
    attemptClaimedAt: null,
    checkoutClaimOwner: null,
    checkoutClaimAmountCents: null
  })

  const attempts = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      claimV3ProductionCheckoutReservation({
        Reservation,
        orderId: id,
        amountCents: 2500,
        owner: `trusted-claim-${String(index).padStart(3, "0")}`
      })
    )
  )

  const winners = attempts.filter(x => x.claimed === true)
  const blocked = attempts.filter(x => x.blocked === true)

  assert.equal(winners.length, 1)
  assert.equal(blocked.length, 49)

  console.log("PASS: 50 simultaneous MongoDB checkout claims")
  console.log("PASS: 1 successful claim")
  console.log("PASS: 49 blocked claims")

  const stored = await Reservation.findOne({
    environment: "production",
    orderId
  }).lean()

  assert.ok(stored)
  assert.equal(stored.status, "claim_pending")
  assert.equal(stored.checkoutClaimAmountCents, 2500)
  assert.equal(stored.checkoutClaimOwner, winners[0].owner)
  assert.ok(stored.attemptClaimedAt)

  console.log("PASS: durable claim owner verified")
  console.log("PASS: server-owned amount persisted")

  const duplicate = await claimV3ProductionCheckoutReservation({
    Reservation,
    orderId: id,
    amountCents: 2500,
    owner: "trusted-later-request"
  })

  assert.equal(duplicate.claimed, false)

  console.log("PASS: later claim remains blocked")

  console.log("MONGODB CHECKOUT CLAIM: ALL TESTS PASSED")
  console.log("ISOLATED DATABASE ONLY")
  console.log("NO PRODUCTION DATABASE WRITES")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect().catch(() => {})
  if (mongo) {
    await mongo.stop()
  }
}