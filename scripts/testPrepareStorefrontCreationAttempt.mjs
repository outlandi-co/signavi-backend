import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import {
  createStorefrontRecoverySecret,
  verifyStorefrontRecoveryProof
} from "../utils/storefrontRecoveryProof.mjs"

import {
  prepareStorefrontCreationAttempt
} from "../utils/prepareStorefrontCreationAttempt.mjs"

const ID = "507f1f77bcf86cd799439011"
const NOW = Date.parse("2026-11-07T12:00:00Z")
const WINDOW = 7 * 24 * 60 * 60 * 1000

const attemptKey = randomUUID()
const recoverySecret = createStorefrontRecoverySecret()

const request = {
  email: "buyer@example.com",
  customerName: "Example Buyer",
  phone: "555-0100",
  address: {
    street: "Example Street",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: ID,
    quantity: 2,
    selectedVariant: {
      color: "Blue",
      size: "Large"
    }
  }]
}

const prepare = (overrides = {}) =>
  prepareStorefrontCreationAttempt({
    request,
    attemptKey,
    recoverySecret,
    now: NOW,
    ...overrides
  })

const metadata = prepare()

assert.deepEqual(
  Object.keys(metadata).sort(),
  [
    "storefrontCreationAttemptKey",
    "storefrontCreationFingerprint",
    "storefrontRecoveryProofHash",
    "storefrontRecoveryExpiresAt"
  ].sort()
)

console.log("PASS: Exact persistence field contract")

assert.equal(
  metadata.storefrontCreationAttemptKey,
  attemptKey.toLowerCase()
)

assert.match(
  metadata.storefrontCreationFingerprint,
  /^[a-f0-9]{64}$/
)

assert.match(
  metadata.storefrontRecoveryProofHash,
  /^[a-f0-9]{64}$/
)

console.log("PASS: Valid attempt identity and fingerprints")

assert.equal(
  metadata.storefrontRecoveryExpiresAt.getTime(),
  NOW + WINDOW
)

console.log("PASS: Seven-day recovery expiration assigned")

assert.equal(
  verifyStorefrontRecoveryProof({
    attemptKey,
    recoverySecret,
    storedHash: metadata.storefrontRecoveryProofHash
  }),
  true
)

console.log("PASS: Stored hash verifies original recovery proof")

const serialized = JSON.stringify(metadata)

assert.equal(serialized.includes(recoverySecret), false)
assert.equal("recoverySecret" in metadata, false)
assert.equal("checkoutToken" in metadata, false)
assert.equal("paymentUrl" in metadata, false)

console.log("PASS: Plaintext secret and payment data excluded")

for (const overrides of [
  { attemptKey: "invalid" },
  { recoverySecret: "" },
  { recoverySecret: "short" },
  { request: { ...request, items: [] } },
  { now: -1 },
  { now: Number.MAX_SAFE_INTEGER }
]) {
  assert.throws(() => prepare(overrides))
}

console.log("PASS: Invalid creation attempts rejected")

const changed = prepare({
  request: {
    ...request,
    items: [{
      ...request.items[0],
      quantity: 3
    }]
  }
})

assert.notEqual(
  changed.storefrontCreationFingerprint,
  metadata.storefrontCreationFingerprint
)

assert.equal(
  changed.storefrontRecoveryProofHash,
  metadata.storefrontRecoveryProofHash
)

console.log("PASS: Purchase identity changes independently of proof")

const second = prepare({
  attemptKey: randomUUID(),
  recoverySecret: createStorefrontRecoverySecret()
})

assert.notEqual(
  second.storefrontRecoveryProofHash,
  metadata.storefrontRecoveryProofHash
)

console.log("PASS: Independent attempts have distinct recovery hashes")