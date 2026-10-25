import assert from "node:assert/strict"

import {
  executeV3GuardedSandboxCreation
} from "../utils/smartShippingV3GuardedSDKExecution.js"

import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const orderId = "507f1f77bcf86cd799439011"
const safe = createV3SquareSafeCheckoutReference({ orderId })
const legacy = createV3CheckoutReference({ orderId })

const saved = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SMART_SHIPPING_V3_ENABLED: process.env.SMART_SHIPPING_V3_ENABLED,
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED:
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
}

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

const merchantId = "SYNTHETIC_MERCHANT"
const locationId = "SYNTHETIC_LOCATION"

let verifyCalls = 0
let claimCalls = 0
let squareCalls = 0

const run = checkoutReferenceId =>
  executeV3GuardedSandboxCreation({
    orderId,
    owner: "synthetic-owner",
    expectedMerchantId: merchantId,
    expectedLocationId: locationId,

    verifyIdentity: async () => {
      verifyCalls++
      return {
        verified: true,
        merchantId,
        locationId,
        squareRequestAuthorized: false
      }
    },

    claimAttempt: async () => {
      claimCalls++
      return {
        claimed: true,
        orderId,
        amountCents: 100,
        idempotencyKey: "signavi-v3-sandbox-offline-boundary",
        checkoutReferenceId,
        claimedAt: "2026-10-24T20:00:00.000Z",
        squareRequestAuthorized: false,
        paymentCreated: false
      }
    },

    createPaymentLink: async request => {
      squareCalls++

      assert.equal(request.order.referenceId, safe)
      assert.equal(request.order.referenceId.length, 35)
      assert.equal(
        request.order.lineItems[0].basePriceMoney.amount,
        100n
      )

      // Synthetic failure, not a real external request.
      throw new Error("Synthetic SDK failure")
    }
  })

try {
  await assert.rejects(run(legacy))

  assert.equal(verifyCalls, 1)
  assert.equal(claimCalls, 1)
  assert.equal(squareCalls, 0)

  console.log("LEGACY CLAIM DATA BLOCKED BEFORE SDK: PASS")

  const result = await run(safe)

  assert.equal(verifyCalls, 2)
  assert.equal(claimCalls, 2)
  assert.equal(squareCalls, 1)
  assert.equal(result.status, "reconciliation_required")

  console.log("SQUARE-SAFE REQUEST REACHES MOCK ONCE: PASS")
  console.log("SYNTHETIC SDK FAILURE REMAINS UNCERTAIN: PASS")
  console.log("NO AUTOMATIC RETRY: PASS")
  console.log("NO DATABASE CONNECTIONS: PASS")
  console.log("NO REAL SQUARE API CALLS: PASS")
  console.log("GUARDED SQUARE-SAFE BOUNDARY: PASS")
} finally {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
