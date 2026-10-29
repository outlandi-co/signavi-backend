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

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const amountCents = 2500

let replset

try {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  })

  await mongoose.connect(replset.getUri(), {
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()
  await PaymentOperation.init()

  await Reservation.create({
    environment: "production",
    orderId,
    purchaseKey,
    idempotencyKey: purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    status: "reserved",
    attemptClaimedAt: null,
    checkoutClaimOwner: null,
    checkoutClaimAmountCents: null
  })

  await PaymentOperation.create({
    environment: "production",
    orderId,
    idempotencyKey: purchaseKey,
    amountCents,
    status: "pending",
    requestOwner: "",
    squareIdempotencyKey: null,
    squareCreationAttemptClaimedAt: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  const options = {
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId,
    amountCents
  }

  // Competing transactions must not produce multiple winners.
  const results = await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      claim({
        ...options,
        owner: `checkout-owner-${String(index).padStart(3, "0")}`
      })
    )
  )

  const winners = results.filter(x => x.claimed === true)

  assert.equal(winners.length, 1)
  assert.equal(
    results.filter(x => x.claimed === false).length,
    24
  )

  const winner = winners[0]

  const reservation = await Reservation.findOne({
    orderId
  }).lean()

  const operation = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(reservation.status, "claim_pending")
  assert.equal(operation.status, "reconciliation_required")

  assert.equal(reservation.checkoutClaimOwner, winner.owner)
  assert.equal(operation.requestOwner, winner.owner)

  assert.equal(
    operation.squareIdempotencyKey,
    winner.squareIdempotencyKey
  )

  assert.equal(reservation.checkoutClaimAmountCents, amountCents)
  assert.ok(reservation.attemptClaimedAt)
  assert.ok(operation.squareCreationAttemptClaimedAt)

  assert.equal(winner.squareRequestAuthorized, false)
  assert.equal(winner.retryAuthorized, false)

  console.log("PASS: 25 competing transactional claims")
  console.log("PASS: Exactly one successful claim")
  console.log("PASS: 24 competing claims blocked")
  console.log("PASS: Both records committed consistently")
  console.log("PASS: Square identity persisted")
  console.log("PASS: Square execution not authorized")

  const replay = await claim({
    ...options,
    owner: winner.owner
  })

  assert.equal(replay.claimed, false)

  assert.equal(
    await Reservation.countDocuments({ orderId }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  console.log("PASS: Repeated claim blocked")
  console.log("PASS: No duplicate purchase records")
  console.log("STEP 318 TRANSACTIONAL CLAIM: PASSED")
  console.log("ISOLATED REPLICA SET ONLY")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  if (replset) await replset.stop()
}