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
  recordV3ProductionCheckoutLink
} from "../utils/recordV3ProductionCheckoutLink.js"

import {
  runV3TrustedProductionCheckoutExecutor
} from "../utils/runV3TrustedProductionCheckoutExecutor.js"

let replset

async function seedPurchase(owner, amountCents = 2500) {
  const orderId = new mongoose.Types.ObjectId()
  const id = String(orderId)
  const purchaseKey = `signavi-v3-production-purchase-${id}`

  await Reservation.create({
    environment: "production",
    orderId,
    purchaseKey,
    idempotencyKey: purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    status: "reserved",
    attemptClaimedAt: null
  })

  await PaymentOperation.create({
    environment: "production",
    orderId,
    idempotencyKey: purchaseKey,
    amountCents,
    status: "pending",
    squareCreationAttemptClaimedAt: null,
    requestOwner: "",
    squareIdempotencyKey: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  return { id, purchaseKey, owner, amountCents }
}

function makeExecutorOptions(identity, squareCreate, counters) {
  const { id, purchaseKey, owner, amountCents } = identity

  return {
    orderId: id,
    purchaseKey,
    owner,
    amountCents,
    locationId: "TEST_LOCATION",
    redirectUrl: `https://signavi.store/success/${id}`,

    claimFresh: async () => {
      counters.claim++

      const result = await claimV3ProductionCheckoutTransactional({
        Reservation,
        PaymentOperation,
        startSession: () => mongoose.startSession(),
        orderId: id,
        owner,
        amountCents
      })

      console.log("STEP345_CLAIM_DIAGNOSTIC", {
        claimed: result?.claimed,
        reason: result?.reason,
        orderMatches: result?.orderId === id,
        purchaseKeyMatches: result?.idempotencyKey === purchaseKey,
        ownerMatches: result?.owner === owner,
        amountMatches: result?.amountCents === amountCents,
        hasSquareKey: Boolean(result?.squareIdempotencyKey)
      })

      return result
    },

    verifyOwnership: async ({ squareIdempotencyKey }) => {
      counters.verify++

      const result = await verifyV3ProductionCheckoutOwnership({
        Reservation,
        PaymentOperation,
        orderId: id,
        purchaseKey,
        owner,
        amountCents,
        squareIdempotencyKey
      })

      console.log("STEP345_OWNERSHIP_DIAGNOSTIC", {
        verified: result?.verified,
        reason: result?.reason,
        orderMatches: result?.orderId === id,
        purchaseKeyMatches: result?.purchaseKey === purchaseKey,
        ownerMatches: result?.owner === owner,
        amountMatches: result?.amountCents === amountCents,
        squareKeyMatches:
          result?.squareIdempotencyKey === squareIdempotencyKey
      })

      return result
    },

    checkoutClient: {
      paymentLinks: {
        create: async (request, options) => {
          counters.square++
          assert.equal(options.maxRetries, 0)
          assert.match(
            request.idempotencyKey,
            /^sv3p-[a-f0-9]{40}$/
          )

          return squareCreate(request)
        }
      }
    },

    recordLink: async evidence => {
      counters.record++

      return recordV3ProductionCheckoutLink({
        Reservation,
        PaymentOperation,
        ...evidence
      })
    },

    holdUncertain: async () => {
      counters.hold++

      // The transaction must already have placed the purchase
      // into reconciliation_required before Square was called.
      const reservation = await Reservation.findOne({
        orderId: id
      }).lean()

      const operation = await PaymentOperation.findOne({
        orderId: id
      }).lean()

      const held =
        reservation?.status === "claim_pending" &&
        operation?.status === "reconciliation_required" &&
        Boolean(operation.squareCreationAttemptClaimedAt)

      return { held }
    }
  }
}

function counters() {
  return {
    claim: 0,
    verify: 0,
    square: 0,
    record: 0,
    hold: 0
  }
}

try {
  replset = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replset.getUri(), {
    dbName: "signavi_v3_trusted_executor_isolated",
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()
  await PaymentOperation.init()

  console.log("PASS: Isolated transactional MongoDB connected")

  // SCENARIO A: Normal checkout and replay protection.
  const normal = await seedPurchase("trusted-owner-344")
  const normalCalls = counters()

  const normalOptions = makeExecutorOptions(
    normal,
    async () => ({
      paymentLink: {
        id: "FAKE_LINK_344",
        orderId: "FAKE_SQUARE_ORDER_344",
        url: "https://square.link/u/fake344"
      }
    }),
    normalCalls
  )

  const first = await runV3TrustedProductionCheckoutExecutor(
    normalOptions
  )

  assert.equal(
    first.status,
    "link_recorded",
    `First checkout failed: ${first.reason}`
  )

  assert.equal(normalCalls.square, 1)
  assert.equal(normalCalls.record, 1)

  const recorded = await PaymentOperation.findOne({
    orderId: normal.id
  }).lean()

  assert.equal(recorded.squarePaymentLinkId, "FAKE_LINK_344")
  assert.equal(recorded.requestOwner, normal.owner)
  assert.match(
    recorded.squareIdempotencyKey,
    /^sv3p-[a-f0-9]{40}$/
  )
  assert.equal(recorded.status, "reconciliation_required")

  console.log("PASS: Fresh transactional claim created one fake link")
  console.log("PASS: Owner, Square key and link persisted")

  const replay = await runV3TrustedProductionCheckoutExecutor(
    normalOptions
  )

  assert.equal(replay.status, "blocked")
  assert.equal(normalCalls.square, 1)

  console.log("PASS: Repeated checkout blocked before Square")

  // SCENARIO B: Square times out after its invocation.
  const uncertain = await seedPurchase("trusted-owner-timeout-344")
  const uncertainCalls = counters()

  const uncertainOptions = makeExecutorOptions(
    uncertain,
    async () => {
      throw new Error("SIMULATED_SQUARE_TIMEOUT")
    },
    uncertainCalls
  )

  const timedOut = await runV3TrustedProductionCheckoutExecutor(
    uncertainOptions
  )

  assert.equal(timedOut.status, "reconciliation_required")
  assert.equal(timedOut.retryAuthorized, false)
  assert.equal(uncertainCalls.square, 1)
  assert.equal(uncertainCalls.hold, 1)

  const uncertainOperation = await PaymentOperation.findOne({
    orderId: uncertain.id
  }).lean()

  assert.equal(
    uncertainOperation.status,
    "reconciliation_required"
  )
  assert.equal(uncertainOperation.squarePaymentLinkId, "")

  const retry = await runV3TrustedProductionCheckoutExecutor(
    uncertainOptions
  )

  assert.equal(retry.status, "blocked")
  assert.equal(uncertainCalls.square, 1)

  console.log("PASS: Square timeout retained durable reconciliation hold")
  console.log("PASS: Timeout replay blocked without new Square call")

  // SCENARIO C: Concurrent requests for one purchase.
  const concurrent = await seedPurchase("trusted-owner-race-344")
  const raceCalls = counters()

  const raceOptions = makeExecutorOptions(
    concurrent,
    async () => ({
      paymentLink: {
        id: "FAKE_RACE_LINK_344",
        orderId: "FAKE_RACE_ORDER_344",
        url: "https://square.link/u/fakerace344"
      }
    }),
    raceCalls
  )

  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      runV3TrustedProductionCheckoutExecutor(raceOptions)
    )
  )

  const winners = results.filter(
    result => result.status === "link_recorded"
  )

  assert.equal(winners.length, 1)
  assert.equal(raceCalls.square, 1)

  assert.equal(
    await PaymentOperation.countDocuments({
      orderId: concurrent.id
    }),
    1
  )

  assert.equal(
    await Reservation.countDocuments({
      orderId: concurrent.id
    }),
    1
  )

  console.log("PASS: 12 concurrent checkouts, 1 recorded winner")
  console.log("PASS: Exactly one fake Square invocation")
  console.log("PASS: No duplicate purchase records")

  console.log("STEP 344: TRUSTED MONGODB EXECUTOR PASSED")
  console.log("FAKE SQUARE ONLY")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO LIVE PAYMENT CREATION")

} finally {
  await mongoose.disconnect()
  if (replset) await replset.stop()
}