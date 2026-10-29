import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import {
  runV3TrustedProductionCheckoutExecutor as execute
} from "../utils/runV3TrustedProductionCheckoutExecutor.js"

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const squareIdempotencyKey =
  `sv3p-${createHash("sha256")
    .update(`square-link:production:${purchaseKey}`)
    .digest("hex")
    .slice(0, 40)}`

const owner = "trusted-owner-341"
const amountCents = 2500

function makeOptions() {
  const calls = {
    claim: 0,
    verify: 0,
    square: 0,
    record: 0,
    hold: 0
  }

  let alreadyClaimed = false

  const options = {
    orderId,
    purchaseKey,
    owner,
    amountCents,
    locationId: "TEST_LOCATION",
    redirectUrl: `https://signavi.store/success/${orderId}`,

    claimFresh: async () => {
      calls.claim++

      if (alreadyClaimed) {
        return { claimed: false }
      }

      alreadyClaimed = true

      return {
        claimed: true,
        orderId,
        purchaseKey,
        owner,
        amountCents,
        squareIdempotencyKey
      }
    },

    verifyOwnership: async () => {
      calls.verify++

      return {
        verified: true,
        orderId,
        purchaseKey,
        owner,
        amountCents,
        squareIdempotencyKey
      }
    },

    checkoutClient: {
      paymentLinks: {
        create: async (request, options) => {
          calls.square++
          assert.equal(
            request.idempotencyKey,
            squareIdempotencyKey
          )
          assert.equal(options.maxRetries, 0)

          return {
            paymentLink: {
              id: "FAKE_LINK_341",
              orderId: "FAKE_SQUARE_ORDER_341",
              url: "https://square.link/u/fake341"
            }
          }
        }
      }
    },

    recordLink: async evidence => {
      calls.record++
      assert.equal(evidence.owner, owner)
      assert.equal(
        evidence.squareIdempotencyKey,
        squareIdempotencyKey
      )
      return { recorded: true }
    },

    holdUncertain: async () => {
      calls.hold++
      return { held: true }
    }
  }

  return { options, calls }
}

test("fresh trusted claim creates and records one fake link", async () => {
  const { options, calls } = makeOptions()

  const result = await execute(options)

  assert.equal(result.status, "link_recorded")
  assert.equal(result.retryAuthorized, false)
  assert.equal(calls.claim, 1)
  assert.equal(calls.verify, 1)
  assert.equal(calls.square, 1)
  assert.equal(calls.record, 1)
  assert.equal(calls.hold, 0)

  const replay = await execute(options)

  assert.equal(replay.status, "blocked")
  assert.equal(calls.square, 1)
})

test("unverified ownership blocks Square", async () => {
  const { options, calls } = makeOptions()

  options.verifyOwnership = async () => {
    calls.verify++
    return { verified: false }
  }

  const result = await execute(options)

  assert.equal(result.status, "blocked")
  assert.equal(calls.square, 0)
})

test("wrong fresh-claim Square key blocks Square", async () => {
  const { options, calls } = makeOptions()
  const originalClaim = options.claimFresh

  options.claimFresh = async args => ({
    ...(await originalClaim(args)),
    squareIdempotencyKey: `sv3p-${"b".repeat(40)}`
  })

  const result = await execute(options)

  assert.equal(result.status, "blocked")
  assert.equal(calls.square, 0)
})

test("invalid request blocks before claim", async () => {
  const { options, calls } = makeOptions()

  options.redirectUrl = "https://example.com/checkout"

  const result = await execute(options)

  assert.equal(result.status, "blocked")
  assert.equal(calls.claim, 0)
  assert.equal(calls.square, 0)
})

test("Square timeout has no automatic retry", async () => {
  const { options, calls } = makeOptions()

  options.checkoutClient.paymentLinks.create = async () => {
    calls.square++
    throw new Error("SIMULATED_SQUARE_TIMEOUT")
  }

  const result = await execute(options)

  assert.notEqual(result.status, "link_recorded")
  assert.equal(result.retryAuthorized, false)
  assert.equal(calls.square, 1)
})