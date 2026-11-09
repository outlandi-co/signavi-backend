import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"

import {
  hashStorefrontRecoveryProof
} from "../utils/storefrontRecoveryProof.mjs"

import {
  isStudioStorefrontRecoveryEligible
} from "../utils/isStudioStorefrontRecoveryEligible.mjs"

const now = Date.now()
const attemptKey = randomUUID()
const recoverySecret = randomBytes(32).toString("base64url")
const fingerprint = "a".repeat(64)

const order = {
  storefront: "signavi_studio",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  storefrontCreationAttemptKey: attemptKey,
  storefrontCreationFingerprint: fingerprint,
  storefrontRecoveryProofHash: hashStorefrontRecoveryProof({
    attemptKey,
    recoverySecret
  }),
  createdAt: new Date(now - 1000),
  storefrontRecoveryExpiresAt: new Date(now + 60000)
}

const input = {
  order,
  attemptKey,
  recoverySecret,
  requestedFingerprint: fingerprint,
  now
}

assert.equal(
  isStudioStorefrontRecoveryEligible(input),
  true
)

console.log("PASS: Valid Studio recovery eligible")

assert.equal(
  isStudioStorefrontRecoveryEligible({
    ...input,
    order: {
      ...order,
      storefront: "signavi_store"
    }
  }),
  false
)

console.log("PASS: Store channel rejected")

assert.equal(
  isStudioStorefrontRecoveryEligible({
    ...input,
    recoverySecret: randomBytes(32).toString("base64url")
  }),
  false
)

console.log("PASS: Invalid recovery secret rejected")

assert.equal(
  isStudioStorefrontRecoveryEligible({
    ...input,
    requestedFingerprint: "b".repeat(64)
  }),
  false
)

console.log("PASS: Changed order fingerprint rejected")

assert.equal(
  isStudioStorefrontRecoveryEligible({
    ...input,
    order: {
      ...order,
      paymentStatus: "paid"
    }
  }),
  false
)

console.log("PASS: Paid order rejected")

assert.equal(
  isStudioStorefrontRecoveryEligible({
    ...input,
    now: now + 120000
  }),
  false
)

console.log("PASS: Expired recovery rejected")

assert.equal(
  isStudioStorefrontRecoveryEligible({
    ...input,
    order: {
      ...order,
      source: "cart_drawer"
    }
  }),
  false
)

console.log("PASS: Unexpected order source rejected")

console.log("PASS: Studio recovery eligibility suite complete")
