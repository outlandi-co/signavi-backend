import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import {
  createStorefrontRecoverySecret,
  hashStorefrontRecoveryProof
} from "../utils/storefrontRecoveryProof.mjs"

import {
  authorizeStoredStorefrontRecovery
} from "../utils/authorizeStoredStorefrontRecovery.mjs"

const NOW = Date.parse("2026-11-07T12:00:00Z")
const DAY = 86400000

const attemptKey = randomUUID()
const recoverySecret = createStorefrontRecoverySecret()
const requestedFingerprint = "a".repeat(64)

const order = {
  storefrontCreationAttemptKey: attemptKey,
  storefrontCreationFingerprint: requestedFingerprint,
  storefrontRecoveryProofHash: hashStorefrontRecoveryProof({
    attemptKey,
    recoverySecret
  }),
  storefrontRecoveryExpiresAt: new Date(NOW + DAY),
  createdAt: new Date(NOW - DAY),
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid"
}

const check = (changes = {}, request = {}) =>
  authorizeStoredStorefrontRecovery({
    order: { ...order, ...changes },
    attemptKey,
    recoverySecret,
    requestedFingerprint,
    now: NOW,
    ...request
  })

const allowed = check()

assert.equal(allowed.authorized, true)
assert.equal(allowed.mayRevealOrder, false)
assert.equal(allowed.mayIssueGuestToken, false)
assert.equal(allowed.mayExecutePayment, false)

console.log("PASS: Proposed Order fields map to recovery policy")

for (const changed of [
  { storefrontRecoveryExpiresAt: new Date(NOW) },
  { storefrontRecoveryExpiresAt: new Date(NOW - 1) },
  { storefrontRecoveryExpiresAt: null },
  { storefrontRecoveryExpiresAt: "invalid" },
  { storefrontRecoveryExpiresAt: new Date(NOW + 8 * DAY) },
  { createdAt: null },
  { createdAt: new Date(NOW + DAY) }
]) {
  assert.equal(check(changed).authorized, false)
}

console.log("PASS: Expired and invalid recovery windows rejected")

assert.equal(
  check({}, { recoverySecret: createStorefrontRecoverySecret() })
    .authorized,
  false
)

assert.equal(
  check({}, { requestedFingerprint: "b".repeat(64) })
    .authorized,
  false
)

assert.equal(
  check({ storefrontRecoveryProofHash: "" }).authorized,
  false
)

console.log("PASS: Invalid proof and fingerprint rejected")

for (const changed of [
  { paymentStatus: "paid" },
  { status: "production" },
  { source: "admin" },
  { storefrontCreationAttemptKey: randomUUID() }
]) {
  assert.equal(check(changed).authorized, false)
}

console.log("PASS: Invalid order identity and states rejected")

const denied = authorizeStoredStorefrontRecovery({
  order: null,
  attemptKey,
  recoverySecret,
  requestedFingerprint,
  now: NOW
})

assert.equal(denied.authorized, false)

for (const decision of [allowed, denied]) {
  assert.equal("orderId" in decision, false)
  assert.equal("checkoutToken" in decision, false)
  assert.equal("email" in decision, false)
  assert.equal(decision.mayRevealOrder, false)
  assert.equal(decision.mayIssueGuestToken, false)
  assert.equal(decision.mayCreateOrder, false)
  assert.equal(decision.mayExecutePayment, false)
}

console.log("PASS: Decisions contain no customer or payment credentials")