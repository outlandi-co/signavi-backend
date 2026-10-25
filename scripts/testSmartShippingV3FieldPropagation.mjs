import assert from "node:assert/strict"
import crypto from "node:crypto"
import { SquareError } from "square"

import {
  runV3SandboxExecutionWorkflow
} from "../utils/smartShippingV3ExecutionWorkflow.js"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const envKeys = [
  "NODE_ENV",
  "SQUARE_ENVIRONMENT",
  "SMART_SHIPPING_V3_ENABLED",
  "SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED"
]

const previous = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]])
)

let createCalls = 0
let claimCalls = 0
let lookupCalls = 0
let recordCalls = 0

try {
  process.env.NODE_ENV = "test"
  process.env.SQUARE_ENVIRONMENT = "sandbox"
  process.env.SMART_SHIPPING_V3_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

  const orderId = crypto.randomBytes(12).toString("hex")

  const result = await runV3SandboxExecutionWorkflow({
    orderId,
    owner: "mock-owner",

    sdk: {
      merchantId: "mock-merchant",
      locationId: "mock-location",

      verifyIdentity: async () => ({
        verified: true,
        squareRequestAuthorized: false,
        merchantId: "mock-merchant",
        locationId: "mock-location"
      }),

      createPaymentLink: async () => {
        createCalls++

        throw new SquareError({
          statusCode: 400,
          body: {
            errors: [{
              category: "INVALID_REQUEST_ERROR",
              code: "INVALID_VALUE",
              field: "order.location_id",
              detail: "SECRET VALIDATION DETAIL"
            }]
          }
        })
      },

      lookupClient: {
        checkout: {
          paymentLinks: {
            get: async () => {
              lookupCalls++
              throw new Error("Unexpected lookup")
            }
          }
        },
        orders: {
          get: async () => {
            lookupCalls++
            throw new Error("Unexpected lookup")
          }
        }
      }
    },

    claimAttempt: async () => {
      claimCalls++

      return {
        claimed: true,
        orderId,
        amountCents: 100,
        checkoutReferenceId:
          createV3CheckoutReference({ orderId }),
        idempotencyKey:
          "signavi-v3-sandbox-field-regression",
        claimedAt: new Date().toISOString(),
        squareRequestAuthorized: false,
        paymentCreated: false
      }
    },

    recordVerifiedLink: async () => {
      recordCalls++
      throw new Error("Unexpected recording")
    }
  })

  assert.equal(result.status, "reconciliation_required")
  assert.equal(result.safeToRetryCreation, false)
  assert.equal(result.paymentLinkRecorded, false)
  assert.equal(result.customerPaymentConfirmed, false)

  assert.equal(result.diagnostic.type, "square_api_error")
  assert.equal(result.diagnostic.statusCode, 400)
  assert.equal(result.diagnostic.code, "INVALID_VALUE")
  assert.equal(result.diagnostic.field, "order.location_id")
  assert.equal(result.diagnostic.outcomeKnown, false)

  assert.equal(claimCalls, 1)
  assert.equal(createCalls, 1)
  assert.equal(lookupCalls, 0)
  assert.equal(recordCalls, 0)

  assert.ok(!JSON.stringify(result).includes("SECRET"))

  console.log("SAFE SQUARE FIELD PROPAGATION: PASS")
  console.log("SENSITIVE DETAILS EXCLUDED: PASS")
  console.log("SINGLE MOCK CREATION: PASS")
  console.log("NO RETRIES OR PAYMENT RECORDING: PASS")
  console.log("RECONCILIATION REQUIRED: PASS")
  console.log("NO REAL SQUARE OR DATABASE REQUESTS: PASS")
  console.log("ALL FIELD PROPAGATION TESTS PASSED")

} finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
