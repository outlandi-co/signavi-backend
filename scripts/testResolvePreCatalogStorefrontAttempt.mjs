import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import {
  createStorefrontRecoverySecret
} from "../utils/storefrontRecoveryProof.mjs"

import {
  resolvePreCatalogStorefrontAttempt
} from "../utils/resolvePreCatalogStorefrontAttempt.mjs"

const NOW = Date.parse("2026-11-07T12:00:00Z")
const attemptKey = randomUUID()
const recoverySecret = createStorefrontRecoverySecret()

const request = {
  email: "buyer@example.com",
  customerName: "Example Buyer",
  phone: "555-0100",
  address: {
    street: "123 Main St",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: "507f1f77bcf86cd799439011",
    quantity: 2,
    selectedVariant: {
      color: "Blue",
      size: "Large"
    }
  }]
}

const run = (findByAttemptKey, changes = {}) =>
  resolvePreCatalogStorefrontAttempt({
    request,
    attemptKey,
    recoverySecret,
    now: NOW,
    findByAttemptKey,
    ...changes
  })

let lookups = 0

const missing = await run(async key => {
  lookups++
  assert.equal(key, attemptKey)
  return null
})

assert.equal(missing.state, "requires-atomic-create")
assert.equal(missing.mayCreateOrder, false)
assert.equal(missing.mayIssueGuestToken, false)
assert.equal(missing.mayExecutePayment, false)
assert.equal(lookups, 1)

console.log("PASS: Missing attempt requires atomic database creation")

const order = {
  ...missing.metadata,
  createdAt: new Date(NOW - 60000),
  storefrontRecoveryExpiresAt: new Date(NOW + 60000),
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid"
}

const existing = await run(async () => order)

assert.equal(
  existing.state,
  "existing-eligible-for-further-authorization"
)
assert.equal(existing.mayCreateOrder, false)
assert.equal(existing.mayIssueGuestToken, false)

console.log("PASS: Existing attempt checked before catalog validation")

const wrongSecret = await run(
  async () => order,
  { recoverySecret: createStorefrontRecoverySecret() }
)

assert.equal(wrongSecret.state, "denied")

const changedCart = await run(
  async () => order,
  {
    request: {
      ...request,
      items: [{
        ...request.items[0],
        quantity: 3
      }]
    }
  }
)

assert.equal(changedCart.state, "denied")

console.log("PASS: Wrong proof and changed purchase rejected")

for (const change of [
  { paymentStatus: "paid" },
  { status: "production" },
  { storefrontRecoveryExpiresAt: new Date(NOW - 1) }
]) {
  const result = await run(async () => ({
    ...order,
    ...change
  }))

  assert.equal(result.state, "denied")
}

console.log("PASS: Paid, ineligible and expired orders denied")

const lookupFailure = await run(async () => {
  throw new Error("Simulated database error")
})

assert.equal(lookupFailure.state, "denied")

const invalid = await run(async () => {
  throw new Error("Lookup should not be called")
}, {
  attemptKey: "invalid"
})

assert.equal(invalid.state, "denied")

console.log("PASS: Invalid requests and lookup failures fail closed")

for (const decision of [
  missing,
  existing,
  wrongSecret,
  changedCart,
  lookupFailure,
  invalid
]) {
  assert.equal("checkoutToken" in decision, false)
  assert.equal("orderId" in decision, false)
  assert.equal("paymentUrl" in decision, false)
  assert.equal(decision.mayCreateOrder, false)
  assert.equal(decision.mayIssueGuestToken, false)
  assert.equal(decision.mayExecutePayment, false)
}

console.log("PASS: No order access or payment authority granted")