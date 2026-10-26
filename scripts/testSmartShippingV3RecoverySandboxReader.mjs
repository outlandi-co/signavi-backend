import assert from "node:assert/strict"

import {
  createV3RecoverySandboxReader
} from "../utils/smartShippingV3RecoverySandboxReader.js"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

const calls = {
  merchant: 0,
  location: 0,
  link: 0,
  order: 0,
  create: 0
}

let merchantValid = true

class FakeSquareClient {
  constructor({ token }) {
    assert.equal(token, "synthetic-token")

    this.merchants = {
      get: async () => {
        calls.merchant++
        return {
          merchant: {
            id: merchantValid ? "merchant-a" : "wrong-merchant",
            status: "ACTIVE",
            currency: "USD"
          }
        }
      }
    }

    this.locations = {
      get: async () => {
        calls.location++
        return {
          location: {
            id: "location-a",
            merchantId: "merchant-a",
            status: "ACTIVE",
            currency: "USD"
          }
        }
      }
    }

    this.checkout = {
      paymentLinks: {
        get: async ({ id }) => {
          calls.link++
          return { paymentLink: { id } }
        },
        create: async () => {
          calls.create++
          throw new Error("FORBIDDEN creation")
        }
      }
    }

    this.orders = {
      get: async ({ orderId }) => {
        calls.order++
        return { order: { id: orderId } }
      }
    }
  }
}

const reader = createV3RecoverySandboxReader({
  token: "synthetic-token",
  expectedMerchantId: "merchant-a",
  expectedLocationId: "location-a",
  Client: FakeSquareClient
})

assert.equal(reader.createPaymentLink, undefined)
assert.equal(reader.lookupClient.checkout.paymentLinks.create, undefined)

await assert.rejects(
  reader.lookupClient.checkout.paymentLinks.get({ id: "link-a" }),
  /identity not verified/
)
assert.equal(calls.link, 0)
console.log("LOOKUP BLOCKED BEFORE IDENTITY VERIFICATION: PASS")

const identity = await reader.verifyIdentity()
assert.equal(identity.verified, true)

await reader.lookupClient.checkout.paymentLinks.get({ id: "link-a" })
await reader.lookupClient.orders.get({ orderId: "order-a" })

assert.equal(calls.link, 1)
assert.equal(calls.order, 1)
assert.equal(calls.create, 0)
console.log("VERIFIED READ-ONLY LOOKUPS: PASS")

merchantValid = false
const invalid = await reader.verifyIdentity()
assert.equal(invalid.verified, false)

await assert.rejects(
  reader.lookupClient.checkout.paymentLinks.get({ id: "link-b" }),
  /identity not verified/
)
await assert.rejects(
  reader.lookupClient.orders.get({ orderId: "order-b" }),
  /identity not verified/
)

assert.equal(calls.link, 1)
assert.equal(calls.order, 1)
assert.equal(calls.create, 0)
console.log("FAILED REVERIFICATION CLOSES LOOKUP GATE: PASS")

process.env.SQUARE_ENVIRONMENT = "production"
assert.throws(
  () => createV3RecoverySandboxReader({
    token: "synthetic-token",
    expectedMerchantId: "merchant-a",
    expectedLocationId: "location-a",
    Client: FakeSquareClient
  }),
  /Invalid V3 recovery Sandbox configuration/
)
console.log("PRODUCTION ENVIRONMENT REJECTED: PASS")

assert.equal(calls.create, 0)
console.log("NO PAYMENT CREATION: PASS")
console.log("NO DATABASE CONNECTION OR WRITES")
console.log("NO REAL SQUARE API REQUESTS")
console.log("NO CREATION FEATURE FLAG ENABLED")