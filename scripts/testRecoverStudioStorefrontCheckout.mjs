import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"

import {
  recoverStudioStorefrontCheckout
} from "../utils/recoverStudioStorefrontCheckout.mjs"

import {
  prepareStorefrontCreationAttempt
} from "../utils/prepareStorefrontCreationAttempt.mjs"

const request = {
  storefront: "signavi_studio",
  customerName: "Recovery Test",
  email: "recovery-test@example.invalid",
  items: [{
    productId: "507f1f77bcf86cd799439011",
    quantity: 1
  }]
}

const attemptKey = randomUUID()
const recoverySecret = randomBytes(32).toString("base64url")
const now = Date.now()
const createdAt = new Date(now - 1000)

const metadata = prepareStorefrontCreationAttempt({
  request,
  attemptKey,
  recoverySecret,
  now: createdAt.getTime()
})

const order = {
  _id: "507f1f77bcf86cd799439011",
  storefront: "signavi_studio",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  createdAt,
  ...metadata
}

let lookups = 0
let tokens = 0

const reset = () => {
  lookups = 0
  tokens = 0
}

const base = {
  attemptKey,
  recoverySecret,
  requestedFingerprint:
    metadata.storefrontCreationFingerprint,
  clientKey: "isolated-test-client",
  now,
  checkThrottle: async () => ({ allowed: true }),
  findOrder: async () => {
    lookups++
    return order
  },
  issueGuestToken: async () => {
    tokens++
    return "isolated-test-token"
  }
}

const recover = overrides =>
  recoverStudioStorefrontCheckout({
    ...base,
    ...overrides
  })

reset()
const allowed = await recover()
assert.equal(allowed.recovered, true)
assert.equal(allowed.orderId, order._id)
assert.equal(tokens, 1)
console.log("PASS: Eligible Studio checkout recovers")

reset()
const throttled = await recover({
  checkThrottle: async () => ({ allowed: false })
})
assert.equal(throttled.recovered, false)
assert.equal(lookups, 0)
assert.equal(tokens, 0)
console.log("PASS: Throttle denies before lookup")

reset()
const wrongSecret = await recover({
  recoverySecret: randomBytes(32).toString("base64url")
})
assert.equal(wrongSecret.recovered, false)
assert.equal(tokens, 0)
console.log("PASS: Incorrect recovery proof denied")

reset()
const wrongFingerprint = await recover({
  requestedFingerprint: "f".repeat(64)
})
assert.equal(wrongFingerprint.recovered, false)
assert.equal(tokens, 0)
console.log("PASS: Fingerprint mismatch denied")

reset()
const wrongChannel = await recover({
  findOrder: async () => {
    lookups++
    return { ...order, storefront: "signavi_store" }
  }
})
assert.equal(wrongChannel.recovered, false)
assert.equal(tokens, 0)
console.log("PASS: Signavi Store rejected")

reset()
const paid = await recover({
  findOrder: async () => {
    lookups++
    return {
      ...order,
      paymentStatus: "paid"
    }
  }
})
assert.equal(paid.recovered, false)
assert.equal(tokens, 0)
console.log("PASS: Paid orders rejected")

reset()
const expired = await recover({
  now: now + 8 * 24 * 60 * 60 * 1000
})
assert.equal(expired.recovered, false)
assert.equal(tokens, 0)
console.log("PASS: Expired recovery rejected")

reset()
const failedLookup = await recover({
  findOrder: async () => {
    throw new Error("Database unavailable")
  }
})
assert.equal(failedLookup.recovered, false)
assert.equal(tokens, 0)
console.log("PASS: Database failures deny recovery")

reset()
const missingClient = await recover({
  clientKey: ""
})
assert.equal(missingClient.recovered, false)
assert.equal(lookups, 0)
assert.equal(tokens, 0)
console.log("PASS: Missing client identity rejected")

console.log("PASS: Studio recovery authorization suite complete")
