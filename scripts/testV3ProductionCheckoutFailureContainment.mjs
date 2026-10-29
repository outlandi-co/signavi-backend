import test from "node:test"
import assert from "node:assert/strict"

import {
  runV3ProductionCheckoutLinkWorkflow
} from "../utils/runV3ProductionCheckoutLinkWorkflow.js"

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`
const owner = "checkout-owner-test-001"

const identity = {
  orderId,
  purchaseKey,
  amountCents: 2500,
  owner
}

function harness(overrides = {}) {
  const calls = {
    claim: 0,
    square: 0,
    persist: 0,
    hold: 0
  }

  const dependencies = {
    claimAttempt: async () => {
      calls.claim++
      return {
        claimed: true,
        orderId,
        idempotencyKey: purchaseKey,
        owner
      }
    },
    createLink: async () => {
      calls.square++
      throw new Error("SIMULATED_SQUARE_TIMEOUT")
    },
    persistLink: async () => {
      calls.persist++
      throw new Error("SHOULD_NOT_PERSIST")
    },
    holdUncertain: async () => {
      calls.hold++
      return { held: true }
    }
  }

  return {
    calls,
    options: {
      ...identity,
      ...dependencies,
      ...overrides
    }
  }
}

test("invalid identity never reaches claim or Square", async () => {
  const h = harness()

  const outcome = await runV3ProductionCheckoutLinkWorkflow({
    ...h.options,
    amountCents: 0
  })

  assert.equal(outcome.status, "blocked")
  assert.equal(outcome.retryAuthorized, false)
  assert.equal(h.calls.claim, 0)
  assert.equal(h.calls.square, 0)
  assert.equal(h.calls.persist, 0)
  assert.equal(h.calls.hold, 0)
})

test("missing trusted dependency blocks before execution", async () => {
  const h = harness()

  const outcome = await runV3ProductionCheckoutLinkWorkflow({
    ...h.options,
    createLink: undefined
  })

  assert.equal(outcome.status, "blocked")
  assert.equal(outcome.retryAuthorized, false)
  assert.equal(h.calls.claim, 0)
  assert.equal(h.calls.square, 0)
})

test("uncertain claim outcome never calls Square", async () => {
  const h = harness({
    claimAttempt: async () => {
      throw new Error("SIMULATED_LOST_DATABASE_ACK")
    }
  })

  const outcome = await runV3ProductionCheckoutLinkWorkflow(
    h.options
  )

  assert.equal(outcome.status, "blocked")
  assert.equal(outcome.reason, "CLAIM_OUTCOME_UNCERTAIN")
  assert.equal(outcome.retryAuthorized, false)
  assert.equal(h.calls.square, 0)
  assert.equal(h.calls.persist, 0)
})

test("unverified durable claim never calls Square", async () => {
  const h = harness({
    claimAttempt: async () => ({
      claimed: true,
      orderId,
      idempotencyKey: "WRONG_PURCHASE_KEY",
      owner
    })
  })

  const outcome = await runV3ProductionCheckoutLinkWorkflow(
    h.options
  )

  assert.equal(outcome.status, "blocked")
  assert.equal(outcome.reason, "DURABLE_CLAIM_NOT_VERIFIED")
  assert.equal(outcome.retryAuthorized, false)
  assert.equal(h.calls.square, 0)
  assert.equal(h.calls.persist, 0)
})

test("Square timeout creates reconciliation hold", async () => {
  const h = harness()

  const outcome = await runV3ProductionCheckoutLinkWorkflow(
    h.options
  )

  assert.equal(h.calls.claim, 1)
  assert.equal(h.calls.square, 1)
  assert.equal(h.calls.persist, 0)
  assert.equal(h.calls.hold, 1)

  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(outcome.retryAuthorized, false)
})

test("failed reconciliation write does not permit retry", async () => {
  let squareCalls = 0
  let holdCalls = 0

  const h = harness({
    createLink: async () => {
      squareCalls++
      throw new Error("SIMULATED_SQUARE_TIMEOUT")
    },
    holdUncertain: async () => {
      holdCalls++
      throw new Error("SIMULATED_RECONCILIATION_WRITE_FAILURE")
    }
  })

  const outcome = await runV3ProductionCheckoutLinkWorkflow(
    h.options
  )

  assert.equal(squareCalls, 1)
  assert.equal(holdCalls, 1)
  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(outcome.reason, "RECONCILIATION_WRITE_UNCERTAIN")
  assert.equal(outcome.retryAuthorized, false)
})

test("Square creation cannot run without verified claim", async () => {
  let squareCalls = 0

  const h = harness({
    claimAttempt: async () => ({
      claimed: false,
      orderId,
      idempotencyKey: purchaseKey,
      owner
    }),
    createLink: async () => {
      squareCalls++
      throw new Error("UNAUTHORIZED_SQUARE_EXECUTION")
    }
  })

  const outcome = await runV3ProductionCheckoutLinkWorkflow(
    h.options
  )

  assert.equal(outcome.status, "blocked")
  assert.equal(squareCalls, 0)
  assert.equal(outcome.retryAuthorized, false)
})