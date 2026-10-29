import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js"

import PaymentOperation from
  "../models/SmartShippingV3PaymentOperation.js"

import {
  verifyV3ProductionCheckoutOwnership as verify
} from "../utils/verifyV3ProductionCheckoutOwnership.js"

const orderId = "507f1f77bcf86cd799439011"
const interruptedId = "507f191e810c19729de860ed"

const owner = "checkout-owner-001"
const amountCents = 2500

const keyFor = id =>
  `signavi-v3-production-purchase-${id}`

const squareKeyFor = id =>
  `sv3p-${createHash("sha256")
    .update(`square-link:production:${keyFor(id)}`)
    .digest("hex")
    .slice(0, 40)}`

const input = id => ({
  Reservation,
  PaymentOperation,
  orderId: id,
  owner,
  amountCents
})

async function createPair(id, interrupted = false) {
  const purchaseKey = keyFor(id)

  await Reservation.create({
    environment: "production",
    orderId: id,
    purchaseKey,
    idempotencyKey: purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: id,
    status: interrupted ? "reserved" : "claim_pending",
    attemptClaimedAt: interrupted ? null : new Date(),
    checkoutClaimOwner: interrupted ? null : owner,
    checkoutClaimAmountCents: interrupted ? null : amountCents
  })

  await PaymentOperation.create({
    environment: "production",
    orderId: id,
    idempotencyKey: purchaseKey,
    amountCents,
    status: "reconciliation_required",
    requestOwner: owner,
    squareIdempotencyKey: squareKeyFor(id),
    squareCreationAttemptClaimedAt: new Date(),
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })
}

let server

try {
  server = await MongoMemoryServer.create()

  await mongoose.connect(server.getUri(), {
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()
  await PaymentOperation.init()

  await createPair(orderId)

  const verified = await verify(input(orderId))

  assert.equal(verified.verified, true)
  assert.equal(
    verified.squareIdempotencyKey,
    squareKeyFor(orderId)
  )
  assert.equal(verified.squareRequestAuthorized, false)
  assert.equal(verified.retryAuthorized, false)

  console.log("PASS: Real MongoDB ownership verified")
  console.log("PASS: Verification grants no Square permission")

  // Simulate a mismatched Square request identity.
  await PaymentOperation.updateOne(
    { orderId },
    {
      $set: {
        squareIdempotencyKey: `sv3p-${"b".repeat(40)}`
      }
    }
  )

  const badKey = await verify(input(orderId))
  assert.equal(badKey.verified, false)
  assert.equal(badKey.squareRequestAuthorized, false)

  console.log("PASS: Incorrect persisted Square key rejected")

  await PaymentOperation.updateOne(
    { orderId },
    {
      $set: {
        squareIdempotencyKey: squareKeyFor(orderId)
      }
    }
  )

  // Simulate a competing owner.
  await PaymentOperation.updateOne(
    { orderId },
    {
      $set: {
        requestOwner: "different-owner-001"
      }
    }
  )

  const badOwner = await verify(input(orderId))
  assert.equal(badOwner.verified, false)

  console.log("PASS: Mismatched persisted owner rejected")

  await PaymentOperation.updateOne(
    { orderId },
    {
      $set: { requestOwner: owner }
    }
  )

  // A payment link already recorded must not be eligible.
  await PaymentOperation.updateOne(
    { orderId },
    {
      $set: {
        squarePaymentLinkId: "existing-link-001"
      }
    }
  )

  const existingLink = await verify(input(orderId))
  assert.equal(existingLink.verified, false)

  console.log("PASS: Existing payment link rejected")

  // Restore the test fixture before checking interruption.
  await PaymentOperation.updateOne(
    { orderId },
    {
      $set: { squarePaymentLinkId: "" }
    }
  )

  const restored = await verify(input(orderId))
  assert.equal(restored.verified, true)

  // Simulate a crash after the operation claim,
  // before the reservation claim.
  await createPair(interruptedId, true)

  const interrupted = await verify(input(interruptedId))

  assert.equal(interrupted.verified, false)
  assert.equal(interrupted.squareRequestAuthorized, false)
  assert.equal(interrupted.retryAuthorized, false)

  console.log("PASS: Interrupted coordinated claim rejected")

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  assert.equal(
    await Reservation.countDocuments({ orderId }),
    1
  )

  console.log("PASS: No duplicate purchase records")
  console.log("STEP 317: MONGODB OWNERSHIP TESTS PASSED")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PRODUCTION DATABASE WRITES")
} finally {
  await mongoose.disconnect()
  if (server) await server.stop()
}