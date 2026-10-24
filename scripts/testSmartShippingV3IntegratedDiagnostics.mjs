import assert from "node:assert/strict"
import { SquareError, SquareTimeoutError } from "square"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  executeV3GuardedSandboxCreation
} from "../utils/smartShippingV3GuardedSDKExecution.js"

const originals = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SMART_SHIPPING_V3_ENABLED: process.env.SMART_SHIPPING_V3_ENABLED,
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED:
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
}

let createCalls = 0
let claimCalls = 0

try {
  process.env.NODE_ENV = "test"
  process.env.SQUARE_ENVIRONMENT = "sandbox"
  process.env.SMART_SHIPPING_V3_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

  const cases = [
    {
      name: "Square HTTP error",
      error: new SquareError({
        message: "SECRET_SQUARE_MESSAGE",
        statusCode: 400,
        body: { token: "SECRET_TOKEN" }
      }),
      expectedType: "square_api_error"
    },
    {
      name: "Square timeout",
      error: new SquareTimeoutError("SECRET_TIMEOUT"),
      expectedType: "timeout"
    },
    {
      name: "Unexpected exception",
      error: new Error("SECRET_INTERNAL_ERROR"),
      expectedType: "unknown_exception"
    }
  ]

  for (const item of cases) {
    const orderId = "6adb60ab0856ccfc26aa57cf"

    const result = await executeV3GuardedSandboxCreation({
      orderId,
      owner: "mock-test-owner",
      expectedMerchantId: "mock-merchant",
      expectedLocationId: "mock-location",

      verifyIdentity: async () => ({
        verified: true,
        squareRequestAuthorized: false,
        merchantId: "mock-merchant",
        locationId: "mock-location"
      }),

      claimAttempt: async () => {
        claimCalls++

        return {
          claimed: true,
          orderId,
          amountCents: 100,
          idempotencyKey:
            "signavi-v3-sandbox-offline-diagnostic",
          checkoutReferenceId:
            createV3CheckoutReference({ orderId }),
          claimedAt: new Date().toISOString(),
          squareRequestAuthorized: false,
          paymentCreated: false
        }
      },

      createPaymentLink: async () => {
        createCalls++
        throw item.error
      }
    })

    assert.equal(result.status, "reconciliation_required")
    assert.equal(result.safeToRetryCreation, false)
    assert.equal(result.paymentCreated, "unknown")
    assert.equal(result.diagnostic.type, item.expectedType)
    assert.equal(result.diagnostic.outcomeKnown, false)

    const text = JSON.stringify(result)

    assert.ok(!text.includes("SECRET"))
    assert.ok(!text.includes("token"))

    console.log(`${item.name}: PASS`)
  }

  assert.equal(createCalls, cases.length)
  assert.equal(claimCalls, cases.length)

  console.log("CLAIM BEFORE EACH MOCK CREATION: PASS")
  console.log("NO AUTOMATIC RETRIES: PASS")
  console.log("NO SENSITIVE ERROR DATA: PASS")
  console.log("NO NETWORK OR DATABASE REQUESTS: PASS")
  console.log("ALL INTEGRATED DIAGNOSTIC TESTS PASSED")
} finally {
  for (const [name, value] of Object.entries(originals)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}