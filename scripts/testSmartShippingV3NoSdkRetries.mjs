import assert from "node:assert/strict"

import {
  bindV3SandboxClient
} from "../utils/smartShippingV3BoundSandboxClient.js"

let creates = 0

const client = {
  merchants: {
    get: async () => ({
      merchant: {
        id: "mock-merchant",
        status: "ACTIVE",
        currency: "USD"
      }
    })
  },
  locations: {
    get: async () => ({
      location: {
        id: "mock-location",
        merchantId: "mock-merchant",
        status: "ACTIVE",
        currency: "USD"
      }
    })
  },
  checkout: {
    paymentLinks: {
      create: async (request, options) => {
        creates++
        assert.deepEqual(request, { test: true })
        assert.deepEqual(options, { maxRetries: 0 })
        return { paymentLink: { id: "mock-link" } }
      },
      get: async () => ({})
    }
  },
  orders: {
    get: async () => ({})
  }
}

const bound = bindV3SandboxClient({
  client,
  expectedMerchantId: "mock-merchant",
  expectedLocationId: "mock-location"
})

await assert.rejects(
  bound.createPaymentLink({ test: true }),
  /not verified/
)

assert.equal(creates, 0)
console.log("UNVERIFIED CREATION BLOCKED: PASS")

const identity = await bound.verifyIdentity()
assert.equal(identity.verified, true)

await bound.createPaymentLink({ test: true })

assert.equal(creates, 1)
console.log("MAX RETRIES ZERO: PASS")
console.log("ONE SDK CREATION INVOCATION: PASS")

await assert.rejects(
  bound.createPaymentLink({ test: true }),
  /not verified/
)

assert.equal(creates, 1)
console.log("SECOND CREATION BLOCKED: PASS")
console.log("NO REAL SQUARE NETWORK REQUESTS: PASS")
console.log("ALL NO-RETRY SDK TESTS PASSED")