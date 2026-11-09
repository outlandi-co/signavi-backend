import assert from "node:assert/strict"

import {
  evaluateStorefrontRecoveryRateLimit
} from "../utils/evaluateStorefrontRecoveryRateLimit.mjs"

const allowed = await evaluateStorefrontRecoveryRateLimit({
  key: "test-attempt",
  increment: async () => ({ count: 1 })
})

assert.equal(allowed.allowed, true)
console.log("PASS: First request allowed")

const limited = await evaluateStorefrontRecoveryRateLimit({
  key: "test-attempt",
  increment: async () => ({ count: 6 })
})

assert.equal(limited.allowed, false)
assert.equal(limited.reason, "rate-limited")
console.log("PASS: Excess requests rejected")

const unavailable = await evaluateStorefrontRecoveryRateLimit({
  key: "test-attempt",
  increment: async () => {
    throw new Error("Storage unavailable")
  }
})

assert.equal(unavailable.allowed, false)
assert.equal(unavailable.reason, "storage-unavailable")
console.log("PASS: Storage failure rejected")

const invalid = await evaluateStorefrontRecoveryRateLimit({
  key: "",
  increment: async () => ({ count: 1 })
})

assert.equal(invalid.allowed, false)
console.log("PASS: Invalid configuration rejected")

const malformed = await evaluateStorefrontRecoveryRateLimit({
  key: "test-attempt",
  increment: async () => ({ count: 0 })
})

assert.equal(malformed.allowed, false)
console.log("PASS: Invalid counter rejected")

console.log("PASS: Recovery rate-limit contract complete")
