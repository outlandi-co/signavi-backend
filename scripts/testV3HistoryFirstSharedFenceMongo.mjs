import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Order from "../models/Order.js"
import LegacyReservation from "../models/SquarePaymentCreationReservation.js"
import SharedPaymentReservation from "../models/SharedSquarePaymentReservation.js"
import ProductionReservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import { checkV3KnownPaymentHistory } from "../utils/checkV3KnownPaymentHistory.js"
import { acquireV3SharedCheckoutFence } from "../utils/acquireV3SharedCheckoutFence.js"
import { initializeV3ProductionCheckoutAtomic } from "../utils/initializeV3ProductionCheckoutAtomic.js"
import { prepareV3TrustedHttpCheckout } from "../utils/prepareV3TrustedHttpCheckout.js"

let replica

const id = () => String(new mongoose.Types.ObjectId())

async function createOrder(orderId) {
  await Order.collection.insertOne({
    _id: new mongoose.Types.ObjectId(orderId),
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    finalPrice: 27.50,
    paymentUrl: "",
    squarePaymentId: "",
    squareOrderId: "",
    squarePaymentLinkId: "",
    paymentUrlCreatedAt: null
  })

  return Order.findById(orderId)
}

function knownHistory(orderId) {
  return checkV3KnownPaymentHistory({
    orderId,
    Order,
    SquareReservation: LegacyReservation,
    SharedPaymentReservation,
    ProductionReservation,
    PaymentOperation
  })
}

let simulatedExternalClearanceCalls = 0

async function testOnlyHistoryClearance({ orderId }) {
  const history = await knownHistory(orderId)

  if (!history.knownRecordsClear) {
    return history
  }

  // TEST ONLY. This is NOT a real Square reconciliation.
  simulatedExternalClearanceCalls++

  return {
    verified: true,
    noPriorPaymentActivity: true,
    testOnlySimulatedSquareClearance: true
  }
}

let fencesAcquired = 0
let initializationCalls = 0

async function reserveThenInitialize({ orderId, amountCents }) {
  const fence = await acquireV3SharedCheckoutFence({
    orderId,
    amountCents
  })

  if (!fence.reserved) {
    return {
      prepared: false,
      reason: fence.reason
    }
  }

  fencesAcquired++

  initializationCalls++

  // Any error here leaves the fence reserved.
  // It must NOT be automatically released or retried.
  return initializeV3ProductionCheckoutAtomic({
    Reservation: ProductionReservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId,
    amountCents
  })
}

async function preflight(order, authorizeRequest = async () => true) {
  return prepareV3TrustedHttpCheckout({
    order,
    authorizeRequest,
    checkHistoricalPayment: testOnlyHistoryClearance,
    initializeCheckout: reserveThenInitialize
  })
}

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replica.getUri(), {
    dbName: "signavi_v3_history_first_fence_isolated",
    serverSelectionTimeoutMS: 10000
  })

  for (const model of [
    Order,
    LegacyReservation,
    SharedPaymentReservation,
    ProductionReservation,
    PaymentOperation
  ]) {
    await model.init()
  }

  console.log("PASS: Isolated MongoDB ready")

  const orderId = id()
  const order = await createOrder(orderId)

  const first = await preflight(order)

  assert.equal(first.ready, true)
  assert.equal(first.amountCents, 2750)
  assert.equal(first.squareRequestAuthorized, false)

  assert.equal(fencesAcquired, 1)
  assert.equal(initializationCalls, 1)

  assert.equal(
    await LegacyReservation.countDocuments({
      orderId,
      environment: "production"
    }),
    1
  )

  assert.equal(
    await ProductionReservation.countDocuments({
      orderId,
      environment: "production"
    }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  console.log("PASS: History-first checkout reserves and initializes once")

  // The new reservation is now payment history.
  const after = await knownHistory(orderId)

  assert.equal(after.verified, false)
  assert.equal(after.knownRecordsClear, false)
  assert.equal(
    after.source,
    "SquarePaymentCreationReservation"
  )

  console.log("PASS: Existing checkout fence becomes visible as payment history")

  const repeat = await preflight(order)

  assert.equal(repeat.ready, false)
  assert.equal(repeat.httpStatus, 423)
  assert.equal(fencesAcquired, 1)
  assert.equal(initializationCalls, 1)

  console.log("PASS: Replay blocked before another initialization")

  // Prior legacy reservation prevents V3 initialization.
  const legacyId = id()
  const legacyOrder = await createOrder(legacyId)

  await LegacyReservation.collection.insertOne({
    orderId: new mongoose.Types.ObjectId(legacyId),
    environment: "production",
    owner: "legacy-owner-test-378",
    idempotencyKey: `signavi-production-${legacyId}`,
    amountCents: 2750,
    status: "reconciliation_required"
  })

  const priorLegacy = await preflight(legacyOrder)

  assert.equal(priorLegacy.ready, false)
  assert.equal(priorLegacy.httpStatus, 423)
  assert.equal(fencesAcquired, 1)
  assert.equal(initializationCalls, 1)

  console.log("PASS: Previous legacy reservation blocks new V3 initialization")

  // Unauthorized caller must not reach history clearance or fence.
  const unauthorizedId = id()
  const unauthorizedOrder = await createOrder(unauthorizedId)

  const clearanceBefore = simulatedExternalClearanceCalls

  const unauthorized = await preflight(
    unauthorizedOrder,
    async () => false
  )

  assert.equal(unauthorized.ready, false)
  assert.equal(unauthorized.httpStatus, 403)
  assert.equal(
    simulatedExternalClearanceCalls,
    clearanceBefore
  )

  assert.equal(
    await LegacyReservation.countDocuments({
      orderId: unauthorizedId
    }),
    0
  )

  console.log("PASS: Unauthorized checkout cannot acquire a fence")

  console.log("===== STEP 378 HISTORY-FIRST TEST PASSED =====")
  console.log("EXTERNAL CLEARANCE WAS SIMULATED FOR THIS TEST ONLY")
  console.log("ZERO SQUARE CALLS")
  console.log("PRODUCTION HTTP ROUTES REMAIN UNCHANGED")

} finally {
  await mongoose.disconnect()
  if (replica) await replica.stop()
}