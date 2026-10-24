import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  executeV3GuardedSandboxCreation as execute
} from "../utils/smartShippingV3GuardedSDKExecution.js"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SMART_SHIPPING_V3_ENABLED = "true"

const orderId = randomBytes(12).toString("hex")
const owner = "mock-owner"
const locationId = "mock-location"
const merchantId = "mock-merchant"

let identityCalls = 0
let claimCalls = 0
let createCalls = 0
let claimed = false

const run = (options = {}) => execute({
  orderId,
  owner,
  expectedMerchantId: merchantId,
  expectedLocationId: locationId,

  verifyIdentity: async () => {
    identityCalls++
    return {
      verified: true,
      squareRequestAuthorized: false,
      merchantId: options.wrongMerchant
        ? "foreign-merchant"
        : merchantId,
      locationId
    }
  },

  claimAttempt: async () => {
    claimCalls++

    if (claimed) {
      throw new Error("Durable claim already consumed.")
    }

    claimed = true

    return {
      claimed: true,
      orderId,
      amountCents: 5528,
      idempotencyKey: "signavi-v3-sandbox-once-test",
      checkoutReferenceId:
        createV3CheckoutReference({ orderId }),
      claimedAt: new Date().toISOString(),
      squareRequestAuthorized: false,
      paymentCreated: false
    }
  },

  createPaymentLink: async request => {
    createCalls++

    assert.equal(request.order.locationId, locationId)
    assert.equal(request.order.referenceId,
      createV3CheckoutReference({ orderId }))
    assert.equal(
      request.order.lineItems[0].basePriceMoney.amount,
      5528n
    )

    if (options.timeout) {
      throw new Error("Simulated Square timeout")
    }

    return {
      paymentLink: {
        id: "mock-link",
        orderId: "mock-square-order",
        url: "https://square.link/u/mock"
      }
    }
  }
})

// Disabled unless explicitly enabled.
delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

await assert.rejects(run(), /disabled/)
assert.equal(identityCalls, 0)
assert.equal(claimCalls, 0)
assert.equal(createCalls, 0)
console.log("DEFAULT-DISABLED GATE: PASS")

process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

await assert.rejects(
  run({ wrongMerchant: true }),
  /identity verification rejected/
)

assert.equal(claimCalls, 0)
assert.equal(createCalls, 0)
console.log("FOREIGN MERCHANT BLOCKED BEFORE CLAIM: PASS")

const result = await run()
assert.equal(result.status, "lookup_required")
assert.equal(result.verified, false)
assert.equal(result.safeToRetryCreation, false)
assert.equal(claimCalls, 1)
assert.equal(createCalls, 1)
console.log("CLAIM BEFORE SINGLE CREATION: PASS")

await assert.rejects(run(), /already consumed/)
assert.equal(createCalls, 1)
console.log("REPEATED EXECUTION BLOCKED: PASS")

// Separate simulated operation for ambiguous outcome.
claimed = false
const uncertain = await run({ timeout: true })

assert.equal(uncertain.status, "reconciliation_required")
assert.equal(uncertain.safeToRetryCreation, false)
assert.equal(createCalls, 2)
console.log("TIMEOUT PRESERVES RECONCILIATION: PASS")

await assert.rejects(run(), /already consumed/)
assert.equal(createCalls, 2)
console.log("NO RETRY AFTER TIMEOUT: PASS")

process.env.NODE_ENV = "production"

try {
  await assert.rejects(run(), /disabled/)
} finally {
  process.env.NODE_ENV = "test"
  delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
}

assert.equal(createCalls, 2)
console.log("PRODUCTION ENVIRONMENT BLOCKED: PASS")
console.log("NO REAL SQUARE API CALLS: PASS")
console.log("ALL GUARDED SDK BOUNDARY TESTS PASSED")