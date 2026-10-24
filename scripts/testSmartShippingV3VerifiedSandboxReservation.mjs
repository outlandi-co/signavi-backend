import assert from "node:assert/strict"

import {
  coordinateV3VerifiedSandboxReservation,
  reserveV3VerifiedSandboxRequest
} from "../utils/smartShippingV3VerifiedSandboxReservation.js"

const events = []

const config = {
  expectedMerchantId: "sandbox-merchant",
  expectedLocationId: "sandbox-location",
  verifyIdentity: async () => {
    events.push("identity")
    return {
      verified: true,
      merchantId: "sandbox-merchant",
      locationId: "sandbox-location",
      squareRequestAuthorized: false
    }
  },
  reserve: async () => {
    events.push("reservation")
    return {
      requestReserved: true,
      status: "reconciliation_required",
      environment: "sandbox",
      squareRequestAuthorized: false,
      paymentCreated: false
    }
  }
}

const success = await coordinateV3VerifiedSandboxReservation(config)

assert.deepEqual(events, ["identity", "reservation"])
assert.equal(success.merchantIdentityVerified, true)
assert.equal(success.squareRequestAuthorized, false)
assert.equal(success.paymentCreated, false)
console.log("IDENTITY VERIFIED BEFORE RESERVATION: PASS")

events.length = 0
await assert.rejects(
  coordinateV3VerifiedSandboxReservation({
    ...config,
    verifyIdentity: async () => ({
      verified: false,
      squareRequestAuthorized: false
    })
  })
)
assert.deepEqual(events, [])
console.log("FAILED IDENTITY BLOCKS RESERVATION: PASS")

events.length = 0
await assert.rejects(
  coordinateV3VerifiedSandboxReservation({
    ...config,
    verifyIdentity: async () => ({
      verified: true,
      merchantId: "foreign-merchant",
      locationId: "sandbox-location",
      squareRequestAuthorized: false
    })
  })
)
assert.deepEqual(events, [])
console.log("FOREIGN MERCHANT BLOCKS RESERVATION: PASS")

events.length = 0
await assert.rejects(
  coordinateV3VerifiedSandboxReservation({
    ...config,
    reserve: async () => {
      events.push("reservation")
      throw new Error("database reservation rejected")
    }
  }),
  /database reservation rejected/
)
assert.deepEqual(events, ["identity", "reservation"])
console.log("DATABASE FAILURE PROPAGATED: PASS")

events.length = 0
await assert.rejects(
  coordinateV3VerifiedSandboxReservation({
    ...config,
    reserve: async () => {
      events.push("reservation")
      return {
        requestReserved: false,
        status: "pending",
        environment: "sandbox",
        squareRequestAuthorized: false,
        paymentCreated: false
      }
    }
  }),
  /reservation result rejected/
)
console.log("INCOMPLETE RESERVATION REJECTED: PASS")

// Production entry point must refuse a disabled environment
// before accessing the Square SDK or MongoDB.
const oldNode = process.env.NODE_ENV
const oldSquare = process.env.SQUARE_ENVIRONMENT
const oldEnabled = process.env.SMART_SHIPPING_V3_ENABLED

try {
  process.env.NODE_ENV = "production"
  process.env.SQUARE_ENVIRONMENT = "sandbox"
  process.env.SMART_SHIPPING_V3_ENABLED = "true"

  await assert.rejects(
    reserveV3VerifiedSandboxRequest({
      orderId: "507f1f77bcf86cd799439011",
      owner: "test-owner"
    }),
    /disabled/
  )

  console.log("PRODUCTION ENVIRONMENT BLOCKED: PASS")
} finally {
  for (const [key, value] of [
    ["NODE_ENV", oldNode],
    ["SQUARE_ENVIRONMENT", oldSquare],
    ["SMART_SHIPPING_V3_ENABLED", oldEnabled]
  ]) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

console.log("NO REAL SQUARE REQUESTS OR DATABASE WRITES: PASS")
console.log("ALL VERIFIED SANDBOX COORDINATOR TESTS PASSED")
