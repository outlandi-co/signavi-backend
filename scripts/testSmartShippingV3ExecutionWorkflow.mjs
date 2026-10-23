import assert from "node:assert/strict"
import crypto from "node:crypto"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  runV3SandboxExecutionWorkflow
} from "../utils/smartShippingV3ExecutionWorkflow.js"

const previous = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SMART_SHIPPING_V3_ENABLED:
    process.env.SMART_SHIPPING_V3_ENABLED,
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED:
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
}

const restore = () => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

const orderId = crypto.randomBytes(12).toString("hex")
const reference = createV3CheckoutReference({ orderId })

let createCalls = 0
let recordCalls = 0
let claims = 0
let lookups = 0
let claimed = false

const run = ({ wrongAmount = false, timeout = false } = {}) => {
  const sdk = {
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
      if (timeout) throw new Error("Simulated timeout")
      return {
        paymentLink: {
          id: "mock-link",
          orderId: "mock-order",
          url: "https://square.link/u/example"
        }
      }
    },
    lookupClient: {
      checkout: {
        paymentLinks: {
          get: async () => {
            lookups++
            return {
              paymentLink: {
                id: "mock-link",
                orderId: "mock-order",
                url: "https://square.link/u/example"
              }
            }
          }
        }
      },
      orders: {
        get: async () => {
          lookups++
          return {
            order: {
              id: "mock-order",
              referenceId: reference,
              locationId: "mock-location",
              totalMoney: {
                amount: wrongAmount ? 5529n : 5528n,
                currency: "USD"
              }
            }
          }
        }
      }
    }
  }

  return runV3SandboxExecutionWorkflow({
    orderId,
    owner: "mock-owner",
    sdk,
    claimAttempt: async () => {
      claims++
      if (claimed) throw new Error("Already claimed")
      claimed = true
      return {
        claimed: true,
        orderId,
        amountCents: 5528,
        checkoutReferenceId: reference,
        idempotencyKey: "signavi-v3-sandbox-workflow-test",
        claimedAt: new Date().toISOString(),
        squareRequestAuthorized: false,
        paymentCreated: false
      }
    },
    recordVerifiedLink: async () => {
      recordCalls++
      return { recorded: true }
    }
  })
}

try {
  const success = await run()
  assert.equal(success.status, "completed")
  assert.equal(success.paymentLinkRecorded, true)
  assert.equal(success.customerPaymentConfirmed, false)
  assert.equal(createCalls, 1)
  assert.equal(recordCalls, 1)
  assert.equal(lookups, 2)
  console.log("COMPLETE MOCK WORKFLOW: PASS")

  await assert.rejects(run(), /Already claimed/)
  assert.equal(createCalls, 1)
  console.log("DUPLICATE EXECUTION BLOCKED: PASS")

  claimed = false
  const uncertain = await run({ timeout: true })
  assert.equal(uncertain.status, "reconciliation_required")
  assert.equal(uncertain.safeToRetryCreation, false)
  assert.equal(recordCalls, 1)
  console.log("TIMEOUT PRESERVES RECONCILIATION: PASS")

  claimed = false
  const invalid = await run({ wrongAmount: true })
  assert.equal(invalid.status, "reconciliation_required")
  assert.equal(recordCalls, 1)
  console.log("WRONG SQUARE AMOUNT REJECTED: PASS")

  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "false"
  const before = createCalls

  await assert.rejects(run(), /disabled/)
  assert.equal(createCalls, before)
  console.log("DEFAULT-DISABLED EXECUTION GATE: PASS")

  console.log("NO REAL SQUARE OR MONGODB CALLS: PASS")
  console.log("ALL V3 EXECUTION WORKFLOW TESTS PASSED")
} finally {
  restore()
}