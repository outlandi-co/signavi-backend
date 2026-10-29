import assert from "node:assert/strict"

import {
  runV3ProductionCheckoutLinkWorkflow
} from "../utils/runV3ProductionCheckoutLinkWorkflow.js"

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

function fixture(overrides = {}) {
  const calls = {
    claim: 0,
    create: 0,
    persist: 0,
    hold: 0
  }

  const args = {
    orderId,
    purchaseKey,
    amountCents: 2500,
    owner: "trusted-test-owner",
    claimAttempt: async identity => {
      calls.claim++
      return {
        claimed: true,
        orderId: identity.orderId,
        idempotencyKey: identity.idempotencyKey,
        owner: identity.owner
      }
    },
    createLink: async () => {
      calls.create++
      return {
        paymentLinkId: "test-link",
        squareOrderId: "test-square-order",
        paymentUrl: "https://example.test/checkout"
      }
    },
    persistLink: async () => {
      calls.persist++
      return { recorded: true }
    },
    holdUncertain: async () => {
      calls.hold++
    },
    ...overrides
  }

  return { args, calls }
}

{
  const { args, calls } = fixture()
  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "link_recorded")
  assert.equal(calls.claim, 1)
  assert.equal(calls.create, 1)
  assert.equal(calls.persist, 1)
  assert.equal(calls.hold, 0)
  assert.equal(outcome.retryAuthorized, false)
  console.log("PASS: initial claimed checkout records link")
}

{
  const { args, calls } = fixture({
    claimAttempt: async () => ({ claimed: false })
  })
  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "blocked")
  assert.equal(calls.create, 0)
  assert.equal(calls.persist, 0)
  console.log("PASS: rejected claim never contacts adapter")
}

{
  const { args, calls } = fixture()
  args.createLink = async () => {
    calls.create++
    throw new Error("Simulated timeout")
  }

  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(calls.create, 1)
  assert.equal(calls.persist, 0)
  assert.equal(calls.hold, 1)
  console.log("PASS: uncertain creation held without retry")
}

{
  const { args, calls } = fixture()
  args.persistLink = async () => {
    calls.persist++
    throw new Error("Simulated database failure")
  }

  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(calls.create, 1)
  assert.equal(calls.persist, 1)
  assert.equal(calls.hold, 1)
  console.log("PASS: uncertain recording held without retry")
}

{
  const { args, calls } = fixture({
    purchaseKey: "untrusted-key"
  })

  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "blocked")
  assert.equal(calls.claim, 0)
  assert.equal(calls.create, 0)
  console.log("PASS: invalid identity blocked before claim")
}

{
  const { args, calls } = fixture()
  args.createLink = async () => {
    calls.create++
    return { paymentUrl: "http://unsafe.example" }
  }

  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(calls.create, 1)
  assert.equal(calls.persist, 0)
  assert.equal(calls.hold, 1)
  console.log("PASS: invalid Square evidence held")
}

{
  const { args, calls } = fixture()

  args.claimAttempt = async () => {
    calls.claim++
    throw new Error("Simulated uncertain claim")
  }

  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "blocked")
  assert.equal(outcome.reason, "CLAIM_OUTCOME_UNCERTAIN")
  assert.equal(calls.create, 0)
  assert.equal(calls.persist, 0)

  console.log("PASS: uncertain claim never creates link")
}

{
  const { args, calls } = fixture()

  args.claimAttempt = async identity => {
    calls.claim++
    return {
      claimed: true,
      orderId: identity.orderId,
      idempotencyKey: identity.idempotencyKey,
      owner: "different-owner"
    }
  }

  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "blocked")
  assert.equal(outcome.reason, "DURABLE_CLAIM_NOT_VERIFIED")
  assert.equal(calls.create, 0)

  console.log("PASS: mismatched claim owner blocked")
}

{
  const { args, calls } = fixture()

  args.createLink = async () => {
    calls.create++
    return {
      paymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "https://example.test/checkout"
    }
  }

  const outcome = await runV3ProductionCheckoutLinkWorkflow(args)

  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(calls.create, 1)
  assert.equal(calls.persist, 0)
  assert.equal(calls.hold, 1)

  console.log("PASS: incomplete Square link held")
}

console.log("CHECKOUT LINK WORKFLOW: 9 TESTS PASSED")
console.log("FAKE ADAPTER ONLY")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO DATABASE WRITES")