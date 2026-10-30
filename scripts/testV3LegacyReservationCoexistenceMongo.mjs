import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import LegacyReservation from "../models/SquarePaymentCreationReservation.js"
import V3Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import V3Operation from "../models/SmartShippingV3PaymentOperation.js"

import {
  initializeV3ProductionCheckoutAtomic
} from "../utils/initializeV3ProductionCheckoutAtomic.js"

let replica

const newId = () => new mongoose.Types.ObjectId()

async function legacyReserve(id) {
  return LegacyReservation.collection.insertOne({
    orderId: id,
    environment: "production",
    idempotencyKey: `signavi-production-${id}`,
    amountCents: 2750,
    status: "reconciliation_required",
    creationAttemptClaimedAt: null
  })
}

async function v3Initialize(id) {
  return initializeV3ProductionCheckoutAtomic({
    Reservation: V3Reservation,
    PaymentOperation: V3Operation,
    startSession: () => mongoose.startSession(),
    orderId: String(id),
    amountCents: 2750
  })
}

async function counts(id) {
  return {
    legacy: await LegacyReservation.countDocuments({
      orderId: id,
      environment: "production"
    }),
    v3: await V3Reservation.countDocuments({
      orderId: id,
      environment: "production"
    }),
    operation: await V3Operation.countDocuments({
      orderId: id
    })
  }
}

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replica.getUri(), {
    dbName: "signavi_v3_cross_workflow_reservation_audit",
    serverSelectionTimeoutMS: 10000
  })

  for (const model of [
    LegacyReservation,
    V3Reservation,
    V3Operation
  ]) {
    await model.init()
  }

  console.log("PASS: Isolated MongoDB unique indexes initialized")

  // Scenario A: Legacy reservation exists first.
  const legacyFirstId = newId()

  await legacyReserve(legacyFirstId)
  const v3AfterLegacy = await v3Initialize(legacyFirstId)

  const legacyFirstCounts = await counts(legacyFirstId)

  console.log("LEGACY FIRST:", {
    v3Prepared: v3AfterLegacy.prepared,
    counts: legacyFirstCounts
  })

  assert.equal(legacyFirstCounts.legacy, 1)
  assert.equal(legacyFirstCounts.v3, 1)
  assert.equal(legacyFirstCounts.operation, 1)
  assert.equal(v3AfterLegacy.prepared, true)

  console.log("CONFIRMED: Existing legacy reservation does not block V3 initializer by itself")

  // Scenario B: V3 reservation exists first.
  const v3FirstId = newId()

  const v3First = await v3Initialize(v3FirstId)
  assert.equal(v3First.prepared, true)

  await legacyReserve(v3FirstId)

  const v3FirstCounts = await counts(v3FirstId)

  console.log("V3 FIRST:", v3FirstCounts)

  assert.equal(v3FirstCounts.legacy, 1)
  assert.equal(v3FirstCounts.v3, 1)
  assert.equal(v3FirstCounts.operation, 1)

  console.log("CONFIRMED: V3 reservation does not block legacy reservation insertion by itself")

  // This is an expected diagnostic finding, not permission
  // to execute either payment.
  console.log("===== STEP 375 RESERVATION ISOLATION CONFIRMED =====")
  console.log("CROSS-COLLECTION RESERVATIONS CAN COEXIST")
  console.log("A SHARED PAYMENT-CREATION BOUNDARY IS REQUIRED")
  console.log("NO SQUARE EXECUTION WAS ATTEMPTED")

} finally {
  await mongoose.disconnect()
  if (replica) await replica.stop()
}