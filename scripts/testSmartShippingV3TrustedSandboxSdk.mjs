import assert from "node:assert/strict"
import {
  SquareEnvironment
} from "square"

import {
  createV3TrustedSandboxSdk
} from "../utils/smartShippingV3TrustedSandboxSdk.js"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SMART_SHIPPING_V3_ENABLED = "true"

let constructed = 0
let creations = 0
let identityReads = 0

class FakeSquareClient {
  constructor({ token, environment }) {
    constructed++

    assert.equal(token, "mock-test-token")
    assert.equal(environment, SquareEnvironment.Sandbox)

    this.merchants = {
      get: async () => {
        identityReads++
        return {
          merchant: {
            id: "mock-merchant",
            status: "ACTIVE",
            currency: "USD"
          }
        }
      }
    }

    this.locations = {
      get: async () => {
        identityReads++
        return {
          location: {
            id: "mock-location",
            merchantId: "mock-merchant",
            status: "ACTIVE",
            currency: "USD"
          }
        }
      }
    }

    this.checkout = {
      paymentLinks: {
        create: async () => {
          creations++
          return {
            paymentLink: {
              id: "mock-link",
              orderId: "mock-order",
              url: "https://square.link/u/mock"
            }
          }
        },
        get: async () => ({
          paymentLink: { id: "mock-link" }
        })
      }
    }

    this.orders = {
      get: async () => ({
        order: { id: "mock-order" }
      })
    }
  }
}

delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

await assert.rejects(
  async () => createV3TrustedSandboxSdk({
    Client: FakeSquareClient
  }),
  /disabled/
)

assert.equal(constructed, 0)
console.log("DEFAULT DISABLED BEFORE SDK CONSTRUCTION: PASS")

process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

const oldToken = process.env.SQUARE_SANDBOX_ACCESS_TOKEN
const oldMerchant = process.env.SQUARE_SANDBOX_MERCHANT_ID
const oldLocation = process.env.SQUARE_SANDBOX_LOCATION_ID

try {
  delete process.env.SQUARE_SANDBOX_ACCESS_TOKEN

  assert.throws(
    () => createV3TrustedSandboxSdk({
      Client: FakeSquareClient
    }),
    /Incomplete trusted Sandbox configuration/
  )

  assert.equal(constructed, 0)
  console.log("MISSING CREDENTIALS BLOCKED: PASS")

  process.env.SQUARE_SANDBOX_ACCESS_TOKEN = "mock-test-token"
  process.env.SQUARE_SANDBOX_MERCHANT_ID = "mock-merchant"
  process.env.SQUARE_SANDBOX_LOCATION_ID = "mock-location"

  const sdk = createV3TrustedSandboxSdk({
    Client: FakeSquareClient
  })

  assert.equal(constructed, 1)

  await assert.rejects(
    sdk.createPaymentLink({}),
    /not verified/
  )

  assert.equal(creations, 0)
  console.log("CREATION BEFORE IDENTITY BLOCKED: PASS")

  const identity = await sdk.verifyIdentity()
  assert.equal(identity.verified, true)
  assert.equal(identityReads, 2)

  const result = await sdk.createPaymentLink({})
  assert.equal(result.paymentLink.id, "mock-link")
  assert.equal(creations, 1)

  console.log("SAME SANDBOX CLIENT USED: PASS")

  await assert.rejects(
    sdk.createPaymentLink({}),
    /not verified/
  )

  assert.equal(creations, 1)
  console.log("REPEATED UNVERIFIED CREATION BLOCKED: PASS")

  assert.equal(
    typeof sdk.lookupClient.checkout.paymentLinks.create,
    "undefined"
  )

  console.log("READ-ONLY LOOKUP VIEW: PASS")

  process.env.NODE_ENV = "production"

  assert.throws(
    () => createV3TrustedSandboxSdk({
      Client: FakeSquareClient
    }),
    /disabled/
  )

  assert.equal(constructed, 1)
  console.log("PRODUCTION CONFIGURATION BLOCKED: PASS")

} finally {
  process.env.NODE_ENV = "test"
  delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

  const restore = (name, value) => {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }

  restore("SQUARE_SANDBOX_ACCESS_TOKEN", oldToken)
  restore("SQUARE_SANDBOX_MERCHANT_ID", oldMerchant)
  restore("SQUARE_SANDBOX_LOCATION_ID", oldLocation)
}

console.log("NO REAL SQUARE NETWORK REQUESTS: PASS")
console.log("ALL TRUSTED SANDBOX SDK TESTS PASSED")