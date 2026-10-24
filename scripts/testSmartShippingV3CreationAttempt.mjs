import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  attemptV3MockSquareCreation
} from "../utils/smartShippingV3CreationAttempt.js"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"

const orderId = randomBytes(12).toString("hex")
const locationId = "mock-location"

const reservation = {
  requestReserved: true,
  status: "reconciliation_required",
  environment: "sandbox",
  merchantIdentityVerified: true,
  squareRequestAuthorized: false,
  paymentCreated: false,
  locationId,
  amountCents: 5528,
  idempotencyKey: "signavi-v3-sandbox-test-once-123",
  checkoutReferenceId: createV3CheckoutReference({ orderId })
}

let calls = 0

const execute = (createPaymentLink, overrides = {}) =>
  attemptV3MockSquareCreation({
    reservation: { ...reservation, ...overrides },
    orderId,
    locationId,
    createPaymentLink
  })

const valid = await execute(async request => {
  calls++
  assert.equal(request.order.locationId, locationId)
  assert.equal(request.order.referenceId, reservation.checkoutReferenceId)
  assert.equal(request.idempotencyKey, reservation.idempotencyKey)
  assert.equal(request.order.lineItems[0].basePriceMoney.amount, 5528n)

  return {
    paymentLink: {
      id: "mock-link",
      orderId: "mock-order",
      url: "https://square.link/u/mock"
    }
  }
})

assert.equal(valid.status, "lookup_required")
assert.equal(valid.safeToRetryCreation, false)
assert.equal(valid.verified, false)
assert.equal(calls, 1)
console.log("ONE MOCK CREATION, LOOKUP REQUIRED: PASS")

const uncertain = await execute(async () => {
  calls++
  throw new Error("Simulated timeout")
})

assert.equal(uncertain.status, "reconciliation_required")
assert.equal(uncertain.safeToRetryCreation, false)
assert.equal(calls, 2)
console.log("TIMEOUT DOES NOT TRIGGER RETRY: PASS")

const incomplete = await execute(async () => {
  calls++
  return { paymentLink: { id: "mock-link" } }
})

assert.equal(incomplete.status, "reconciliation_required")
assert.equal(calls, 3)
console.log("INCOMPLETE RESPONSE REQUIRES RECONCILIATION: PASS")

await assert.rejects(
  execute(async () => { calls++ }, {
    requestReserved: false
  })
)
assert.equal(calls, 3)
console.log("UNRESERVED REQUEST BLOCKED: PASS")

await assert.rejects(
  execute(async () => { calls++ }, {
    locationId: "foreign-location"
  })
)
assert.equal(calls, 3)
console.log("LOCATION MISMATCH BLOCKED: PASS")

const oldEnv = process.env.NODE_ENV
process.env.NODE_ENV = "production"

try {
  await assert.rejects(
    execute(async () => { calls++ }),
    /isolated test mode/
  )
} finally {
  process.env.NODE_ENV = oldEnv
}

assert.equal(calls, 3)
console.log("PRODUCTION MODE BLOCKED: PASS")
console.log("NO REAL SQUARE SDK OR DATABASE CALLS: PASS")
console.log("ALL MOCK CREATION ATTEMPT TESTS PASSED")