import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import {
  createStorefrontRecoverySecret,
  hashStorefrontRecoveryProof
} from "../utils/storefrontRecoveryProof.mjs"

import {
  authorizeStorefrontRecovery
} from "../utils/authorizeStorefrontRecovery.mjs"

const NOW = Date.parse("2026-11-07T12:00:00Z")
const key = randomUUID()
const secret = createStorefrontRecoverySecret()
const fingerprint = "a".repeat(64)

const record = {
  attemptKey: key,
  fingerprint,
  recoveryHash: hashStorefrontRecoveryProof({
    attemptKey: key,
    recoverySecret: secret
  }),
  createdAt: new Date(NOW - 60000),
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid"
}

const check = (overrides = {}, request = {}) =>
  authorizeStorefrontRecovery({
    attemptKey: key,
    recoverySecret: secret,
    requestedFingerprint: fingerprint,
    record: { ...record, ...overrides },
    now: NOW,
    ...request
  })

const valid = check()

assert.equal(valid.authorized, true)
assert.equal(valid.mayRevealOrder, false)
assert.equal(valid.mayIssueGuestToken, false)
assert.equal(valid.mayCreateOrder, false)
assert.equal(valid.mayExecutePayment, false)
assert.equal("checkoutToken" in valid, false)
assert.equal("orderId" in valid, false)

console.log("PASS: Eligible recovery returns policy decision only")

for (const request of [
  { attemptKey: randomUUID() },
  { recoverySecret: createStorefrontRecoverySecret() },
  { recoverySecret: "" },
  { requestedFingerprint: "b".repeat(64) },
  { record: null }
]) {
  assert.equal(
    check({}, request).authorized,
    false
  )
}

console.log("PASS: Missing or mismatched proof fails closed")

for (const override of [
  { source: "admin" },
  { status: "production" },
  { paymentStatus: "paid" },
  { paymentStatus: "pending" },
  { createdAt: new Date(NOW + 1000) },
  { createdAt: new Date(NOW - 7 * 86400000) },
  { createdAt: "invalid" },
  { recoveryHash: "" },
  { fingerprint: "" }
]) {
  const denied = check(override)
  assert.equal(denied.authorized, false)
  assert.equal(denied.mayRevealOrder, false)
  assert.equal(denied.mayIssueGuestToken, false)
}

console.log("PASS: Invalid order states and expired proofs rejected")

assert.equal(
  check({ createdAt: new Date(NOW - 6 * 86400000) })
    .authorized,
  true
)

console.log("PASS: Unexpired recovery window accepted")

assert.deepEqual(
  Object.keys(valid).sort(),
  [
    "authorized",
    "mayCreateOrder",
    "mayExecutePayment",
    "mayIssueGuestToken",
    "mayRevealOrder"
  ].sort()
)

console.log("PASS: Policy contains no customer information")