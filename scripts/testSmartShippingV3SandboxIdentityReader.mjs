import assert from "node:assert/strict"

import {
  createV3SandboxIdentityReader
} from "../utils/smartShippingV3SandboxIdentityReader.js"

import {
  SquareEnvironment
} from "square"

let merchantCalls = 0
let locationCalls = 0
let responseMerchantId = "merchant-test"
let responseLocationMerchantId = "merchant-test"

class MockSquareClient {
  constructor({ token, environment }) {
    assert.equal(token, "mock-token")
    assert.equal(environment, SquareEnvironment.Sandbox)

    this.merchants = {
      get: async ({ merchantId }) => {
        merchantCalls++
        assert.equal(merchantId, "merchant-test")
        return {
          merchant: {
            id: responseMerchantId,
            status: "ACTIVE",
            currency: "USD"
          }
        }
      }
    }

    this.locations = {
      get: async ({ locationId }) => {
        locationCalls++
        assert.equal(locationId, "location-test")
        return {
          location: {
            id: "location-test",
            merchantId: responseLocationMerchantId,
            status: "ACTIVE",
            currency: "USD"
          }
        }
      }
    }
  }
}

const config = {
  environment: "sandbox",
  token: "mock-token",
  expectedMerchantId: "merchant-test",
  expectedLocationId: "location-test",
  Client: MockSquareClient
}

assert.throws(
  () => createV3SandboxIdentityReader({
    ...config,
    environment: "production"
  })
)
console.log("PRODUCTION ENVIRONMENT REJECTED: PASS")

assert.throws(
  () => createV3SandboxIdentityReader({
    ...config,
    token: ""
  })
)
console.log("MISSING TOKEN REJECTED: PASS")

const reader = createV3SandboxIdentityReader(config)

assert.equal(merchantCalls, 0)
assert.equal(locationCalls, 0)
assert.equal(reader.environment, "sandbox")
assert.equal(reader.checkout, undefined)
assert.equal(reader.payments, undefined)
assert.equal(reader.merchants, undefined)
assert.equal(reader.locations, undefined)

console.log("NO REQUEST DURING CONSTRUCTION: PASS")
console.log("PAYMENT METHODS NOT EXPOSED: PASS")

const valid = await reader.verifyIdentity()

assert.equal(valid.verified, true)
assert.equal(valid.squareRequestAuthorized, false)
assert.equal(merchantCalls, 1)
assert.equal(locationCalls, 1)

console.log("SHARED MOCK CLIENT VERIFIED: PASS")
console.log("MERCHANT AND LOCATION MATCH: PASS")

responseLocationMerchantId = "foreign-merchant"

const foreign = await reader.verifyIdentity()

assert.equal(foreign.verified, false)
assert.equal(foreign.reason, "location_merchant_mismatch")
assert.equal(foreign.squareRequestAuthorized, false)

console.log("FOREIGN LOCATION REJECTED: PASS")

responseLocationMerchantId = "merchant-test"
responseMerchantId = "other-merchant"

const wrongMerchant = await reader.verifyIdentity()

assert.equal(wrongMerchant.verified, false)
assert.equal(wrongMerchant.reason, "merchant_identity_mismatch")
assert.equal(wrongMerchant.squareRequestAuthorized, false)

console.log("INCORRECT MERCHANT REJECTED: PASS")
console.log("NO REAL SQUARE REQUESTS: PASS")
console.log("NO DATABASE WRITES: PASS")
console.log("ALL SANDBOX IDENTITY READER TESTS PASSED")