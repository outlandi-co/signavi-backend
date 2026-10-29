import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  claimV3ProductionCheckoutTransactional
} from "../utils/claimV3ProductionCheckoutTransactional.js"

import {
  verifyV3ProductionCheckoutOwnership
} from "../utils/verifyV3ProductionCheckoutOwnership.js"

import {
  runV3ProductionCheckoutLinkWorkflow
} from "../utils/runV3ProductionCheckoutLinkWorkflow.js"

import {
  recordV3ProductionCheckoutLink
} from "../utils/recordV3ProductionCheckoutLink.js"

const orderId = "507f1f77bcf86cd799439011"
const owner = "checkout-owner-320"
const amountCents = 2500
const purchaseKey = `signavi-v3-production-purchase-${orderId}`

let replset
let fakeSquareCalls = 0
let verifiedFreshClaim = null

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
    orderId,
    purchaseKey,
    amountCents,
    owner,

    claimAttempt: async identity => {
      const claim = await claimV3ProductionCheckoutTransactional({
        Reservation,
        PaymentOperation,
        startSession: () => mongoose.startSession(),
        orderId: identity.orderId,
        owner: identity.owner,
        amountCents: identity.amountCents
      })

      if (claim.claimed !== true) {
        return {
          claimed: false,
          reason: claim.reason
        }
      }

      const verification =
        await verifyV3ProductionCheckoutOwnership({
          Reservation,
          PaymentOperation,
          orderId,
          owner,
          amountCents
        })

      if (
        verification.verified !== true ||
        verification.squareIdempotencyKey !==
          claim.squareIdempotencyKey ||
        verification.squareRequestAuthorized !== false
      ) {
        throw new Error("OWNERSHIP_VERIFICATION_FAILED")
      }

      // Test-local evidence from this invocation only.
      // This is not production execution authorization.
      verifiedFreshClaim = claim

      return {
        claimed: true,
        orderId,
        owner,
        idempotencyKey: purchaseKey
      }
    },

    createLink: async identity => {
      if (
        verifiedFreshClaim?.claimed !== true ||
        verifiedFreshClaim.owner !== identity.owner ||
        verifiedFreshClaim.purchaseKey !== identity.purchaseKey
      ) {
        throw new Error("FRESH_CLAIM_REQUIRED")
      }

      fakeSquareCalls++

      return {
        paymentLinkId: "FAKE_LINK_320",
        squareOrderId: "FAKE_SQUARE_ORDER_320",
        paymentUrl: "https://square.link/u/fake320"
      }
    },

    persistLink: async evidence =>
      recordV3ProductionCheckoutLink({
        Reservation,
        PaymentOperation,
        ...evidence
      }),

    holdUncertain: async () => {
      // This mock must not be used to establish
      // real reconciliation durability.
      throw new Error("UNEXPECTED_RECONCILIATION_PATH")
    }
  }

  const first = await runV3ProductionCheckoutLinkWorkflow(
    options
  )

  assert.equal(first.status, "link_recorded")
  assert.equal(first.retryAuthorized, false)
  assert.equal(fakeSquareCalls, 1)

  const reservation = await Reservation.findOne({
    orderId
  }).lean()

  const operation = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(reservation.status, "claim_pending")
  assert.equal(reservation.checkoutClaimOwner, owner)

  assert.equal(operation.status, "reconciliation_required")
  assert.equal(operation.requestOwner, owner)
  assert.equal(
    operation.squareIdempotencyKey,
    verifiedFreshClaim.squareIdempotencyKey
  )
  assert.equal(operation.squarePaymentLinkId, "FAKE_LINK_320")
  assert.equal(operation.squareOrderId, "FAKE_SQUARE_ORDER_320")
  assert.equal(operation.paymentUrl, "https://square.link/u/fake320")

  console.log("PASS: Transactional claim committed")
  console.log("PASS: Durable ownership verified")
  console.log("PASS: Fake Square request issued once")
  console.log("PASS: Link recorded in MongoDB")
  console.log("PASS: Purchase retained reconciliation hold")

  verifiedFreshClaim = null

  const second = await runV3ProductionCheckoutLinkWorkflow(
    options
  )

  assert.equal(second.status, "blocked")
  assert.equal(second.retryAuthorized, false)
  assert.equal(fakeSquareCalls, 1)

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  assert.equal(
    await Reservation.countDocuments({ orderId }),
    1
  )

  console.log("PASS: Repeated checkout blocked")
  console.log("PASS: Fake Square request count remains one")
  console.log("PASS: No duplicate purchase records")
  console.log("STEP 320: END-TO-END CHECKOUT TEST PASSED")
  console.log("FAKE SQUARE ONLY")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO LIVE PAYMENT CREATION")

} finally {
  await mongoose.disconnect()
  if (replset) await replset.stop()
}