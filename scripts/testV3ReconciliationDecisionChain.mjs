import assert from "node:assert/strict"
import test from "node:test"

import {
  probeV3ExternalPaymentHistory
} from "../utils/probeV3ExternalPaymentHistory.js"

import {
  assessV3ExternalReconciliation
} from "../utils/assessV3ExternalReconciliation.js"

const ID = "507f1f77bcf86cd799439011"

const knownHistory = Object.freeze({
  knownRecordsClear: true,
  verified: false,
  noPriorPaymentActivity: false
})

async function evaluate(lookup, history = knownHistory) {
  const probe = await probeV3ExternalPaymentHistory({
    orderId: ID,
    lookup
  })

  const decision = assessV3ExternalReconciliation({
    orderId: ID,
    knownHistory: history,
    squareEvidence: {
      existingPayment:
        probe.reason === "EXISTING_SQUARE_ACTIVITY",
      existingLink:
        probe.reason === "EXISTING_SQUARE_ACTIVITY",
      conflicting:
        probe.reason === "EXTERNAL_HISTORY_CONFLICT"
    }
  })

  for (const result of [probe, decision]) {
    assert.equal(result.squareRequestAuthorized, false)
    assert.equal(result.retryAuthorized, false)
    assert.equal(Object.isFrozen(result), true)
  }

  assert.equal(probe.verified, false)
  assert.equal(probe.noPriorPaymentActivity, false)
  assert.equal(decision.cleared, false)
  assert.equal(decision.readyForTrustedInitialization, false)

  return { probe, decision }
}

test("empty lookup remains blocked", async () => {
  const { probe } = await evaluate(async () => ({}))

  assert.equal(
    probe.reason,
    "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED"
  )
})

test("claimed complete history remains blocked", async () => {
  const { probe } = await evaluate(async () => ({
    complete: true,
    verified: true,
    noPriorPaymentActivity: true,
    squareRequestAuthorized: true
  }))

  assert.equal(probe.verified, false)
})

test("existing Square activity remains blocked", async () => {
  const { probe, decision } = await evaluate(
    async () => ({ existingPayment: true })
  )

  assert.equal(probe.reason, "EXISTING_SQUARE_ACTIVITY")
  assert.equal(
    decision.reason,
    "EXISTING_SQUARE_ACTIVITY_REQUIRES_RECONCILIATION"
  )
})

test("conflicting identity remains blocked", async () => {
  const { probe, decision } = await evaluate(
    async () => ({ identityMismatch: true })
  )

  assert.equal(probe.reason, "EXTERNAL_HISTORY_CONFLICT")
  assert.equal(decision.reason, "SQUARE_EVIDENCE_CONFLICT")
})

test("incomplete search remains blocked", async () => {
  const { probe } = await evaluate(async () => ({
    complete: false,
    hasMore: true
  }))

  assert.equal(probe.reason, "EXTERNAL_HISTORY_INCOMPLETE")
})

test("lookup errors remain blocked", async () => {
  const { probe } = await evaluate(async () => {
    throw new Error("synthetic lookup failure")
  })

  assert.equal(probe.reason, "EXTERNAL_HISTORY_LOOKUP_FAILED")
})

test("existing MongoDB history remains blocked", async () => {
  const { decision } = await evaluate(
    async () => ({}),
    { knownRecordsClear: false, source: "PaymentOperation" }
  )

  assert.equal(
    decision.reason,
    "KNOWN_PAYMENT_HISTORY_NOT_CLEARED"
  )
})

test("concurrent requests cannot authorize Square", async () => {
  let calls = 0

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      evaluate(async request => {
        calls++
        assert.deepEqual(request, { orderId: ID })
        return {
          complete: true,
          verified: true,
          noPriorPaymentActivity: true
        }
      })
    )
  )

  assert.equal(calls, 20)
  assert.equal(results.length, 20)
})

console.log("TEST ONLY: NO SQUARE CLIENT OR DATABASE")