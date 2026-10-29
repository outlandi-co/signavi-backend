import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js"

import PaymentOperation from
  "../models/SmartShippingV3PaymentOperation.js"

import {
  claimV3ProductionCheckoutTransactional as claim
} from "../utils/claimV3ProductionCheckoutTransactional.js"

const owner = "checkout-owner-001"
const amountCents = 2500

const keyFor = id =>
  `signavi-v3-production-purchase-${id}`

async function seed(id, reservationAvailable = true) {
  const key = keyFor(id)

  await Reservation.create({
    environment: "production",
    orderId: id,
    purchaseKey: key,
    idempotencyKey: key,
    claimedByDocumentType: "order",
    claimedByDocumentId: id,
    status: reservationAvailable ? "reserved" : "claim_pending",
    attemptClaimedAt: reservationAvailable ? null : new Date(),
    checkoutClaimOwner: reservationAvailable ? null : owner,
    checkoutClaimAmountCents: reservationAvailable ? null : amountCents
  })

  await PaymentOperation.create({
    environment: "production",
    orderId: id,
    idempotencyKey: key,
    amountCents,
    status: "pending",
    requestOwner: "",
    squareIdempotencyKey: null,
    squareCreationAttemptClaimedAt: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })
}

function options(id, startSession = () => mongoose.startSession()) {
  return {
    Reservation,
    PaymentOperation,
    startSession,
    orderId: id,
    owner,
    amountCents
  }
}

let replset

try {
  replset = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replset.getUri(), {
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()
  await PaymentOperation.init()

  // CASE 1: Normal confirmed commit.
  const normalId = "507f1f77bcf86cd799439011"
  await seed(normalId)

  const normal = await claim(options(normalId))

  assert.equal(normal.claimed, true)
  assert.equal(normal.squareRequestAuthorized, false)

  console.log("PASS: Confirmed commit persists a claim")
  console.log("PASS: Confirmed claim does not authorize Square")

  // CASE 2: Reservation claim unavailable.
  // The payment-operation update must roll back.
  const abortedId = "507f191e810c19729de860ed"
  await seed(abortedId, false)

  const aborted = await claim(options(abortedId))

  assert.equal(aborted.claimed, false)
  assert.equal(aborted.squareRequestAuthorized, false)

  const abortedOperation =
    await PaymentOperation.findOne({
      orderId: abortedId
    }).lean()

  assert.equal(abortedOperation.status, "pending")
  assert.equal(abortedOperation.squareIdempotencyKey, null)
  assert.equal(abortedOperation.squareCreationAttemptClaimedAt, null)

  console.log("PASS: Failed reservation claim rolls back operation")

  // CASE 3: MongoDB commits, but the acknowledgment is lost.
  const uncertainId = "507f1f77bcf86cd799439012"
  await seed(uncertainId)

  const uncertainSession = async () => {
    const session = await mongoose.startSession()
    const actualCommit = session.commitTransaction.bind(session)

    session.commitTransaction = async (...args) => {
      await actualCommit(...args)

      // The commit happened; simulate loss of its response.
      throw new Error("SIMULATED_LOST_COMMIT_ACK")
    }

    return session
  }

  const uncertain = await claim(
    options(uncertainId, uncertainSession)
  )

  assert.equal(uncertain.claimed, false)
  assert.equal(
    uncertain.reason,
    "TRANSACTION_COMMIT_OUTCOME_UNCERTAIN"
  )
  assert.equal(uncertain.squareRequestAuthorized, false)
  assert.equal(uncertain.retryAuthorized, false)

  const persistedOperation =
    await PaymentOperation.findOne({
      orderId: uncertainId
    }).lean()

  const persistedReservation =
    await Reservation.findOne({
      orderId: uncertainId
    }).lean()

  assert.equal(
    persistedOperation.status,
    "reconciliation_required"
  )

  assert.equal(
    persistedReservation.status,
    "claim_pending"
  )

  assert.equal(
    persistedOperation.requestOwner,
    persistedReservation.checkoutClaimOwner
  )

  assert.ok(persistedOperation.squareIdempotencyKey)
  assert.ok(persistedOperation.squareCreationAttemptClaimedAt)

  console.log("PASS: Lost acknowledgment can follow a real commit")
  console.log("PASS: Both records remain durably claimed")
  console.log("PASS: Uncertain result grants no Square permission")

  const replay = await claim(options(uncertainId))

  assert.equal(replay.claimed, false)
  assert.equal(replay.squareRequestAuthorized, false)

  console.log("PASS: Retry following uncertain commit blocked")

  assert.equal(
    await PaymentOperation.countDocuments({
      orderId: uncertainId
    }),
    1
  )

  assert.equal(
    await Reservation.countDocuments({
      orderId: uncertainId
    }),
    1
  )

  console.log("PASS: No duplicate purchase records")
  console.log("STEP 319: TRANSACTION FAILURE TESTS PASSED")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()

  if (replset) {
    await replset.stop()
  }
}