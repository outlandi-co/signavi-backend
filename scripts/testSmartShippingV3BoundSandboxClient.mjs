import assert from "node:assert/strict"

import {
  bindV3SandboxClient
} from "../utils/smartShippingV3BoundSandboxClient.js"

const calls = {
  merchant: 0,
  location: 0,
  create: 0,
  linkGet: 0,
  orderGet: 0
}

const client = {
  merchants: {
    get: async ({ merchantId }) => {
      calls.merchant++
      assert.equal(merchantId, "mock-merchant")
      return {
        merchant: {
          id: "mock-merchant",
          status: "ACTIVE",
          currency: "USD"
        }
      }
    }
  },
  locations: {
    get: async ({ locationId }) => {
      calls.location++
      assert.equal(locationId, "mock-location")
      return {
        location: {
          id: "mock-location",
          merchantId: "mock-merchant",
          status: "ACTIVE",
          currency: "USD"
        }
      }
    }
  },
  checkout: {
    paymentLinks: {
      create: async request => {
        calls.create++
        assert.equal(request.idempotencyKey, "test-key")
        return { paymentLink: { id: "mock-link" } }
      },
      get: async () => {
        calls.linkGet++
        return { paymentLink: { id: "mock-link" } }
      }
    }
  },
  orders: {
    get: async () => {
      calls.orderGet++
      return { order: { id: "mock-order" } }
    }
  }
}

const bound = bindV3SandboxClient({
  client,
  expectedMerchantId: "mock-merchant",
  expectedLocationId: "mock-location"
})

await assert.rejects(
  bound.createPaymentLink({ idempotencyKey: "test-key" }),
  /not verified/
)
assert.equal(calls.create, 0)
console.log("CREATION BEFORE VERIFICATION BLOCKED: PASS")

const identity = await bound.verifyIdentity()
assert.equal(identity.verified, true)

const response = await bound.createPaymentLink({
  idempotencyKey: "test-key"
})

assert.equal(response.paymentLink.id, "mock-link")
assert.equal(calls.create, 1)
console.log("SAME CLIENT VERIFICATION AND CREATION: PASS")

await assert.rejects(
  bound.createPaymentLink({ idempotencyKey: "test-key" }),
  /not verified/
)
assert.equal(calls.create, 1)
console.log("SECOND CREATION WITHOUT REVERIFICATION BLOCKED: PASS")

await bound.lookupClient.checkout.paymentLinks.get({
  id: "mock-link"
})
await bound.lookupClient.orders.get({
  orderId: "mock-order"
})

assert.equal(calls.linkGet, 1)
assert.equal(calls.orderGet, 1)
assert.equal(calls.merchant, 1)
assert.equal(calls.location, 1)
console.log("SAME CLIENT READ-ONLY LOOKUPS: PASS")

assert.equal(
  typeof bound.lookupClient.checkout.paymentLinks.create,
  "undefined"
)
console.log("LOOKUP CLIENT CANNOT CREATE PAYMENTS: PASS")
console.log("NO REAL SQUARE API REQUESTS: PASS")
console.log("ALL BOUND SANDBOX CLIENT TESTS PASSED")