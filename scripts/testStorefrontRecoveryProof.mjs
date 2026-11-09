import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import {
  createStorefrontRecoverySecret,
  hashStorefrontRecoveryProof,
  verifyStorefrontRecoveryProof
} from "../utils/storefrontRecoveryProof.mjs"

const key = randomUUID()
const secret = createStorefrontRecoverySecret()

assert.match(secret, /^[A-Za-z0-9_-]{43}$/)
assert.equal(Buffer.from(secret, "base64url").length, 32)

console.log("PASS: Recovery credential has 256-bit random secret")

const storedHash = hashStorefrontRecoveryProof({
  attemptKey: key,
  recoverySecret: secret
})

assert.match(storedHash, /^[a-f0-9]{64}$/)

assert.equal(
  verifyStorefrontRecoveryProof({
    attemptKey: key,
    recoverySecret: secret,
    storedHash
  }),
  true
)

console.log("PASS: Matching recovery proof verified")

assert.equal(
  verifyStorefrontRecoveryProof({
    attemptKey: randomUUID(),
    recoverySecret: secret,
    storedHash
  }),
  false
)

console.log("PASS: Recovery proof bound to purchase attempt")

assert.equal(
  verifyStorefrontRecoveryProof({
    attemptKey: key,
    recoverySecret: createStorefrontRecoverySecret(),
    storedHash
  }),
  false
)

console.log("PASS: Different recovery secret rejected")

assert.equal(
  verifyStorefrontRecoveryProof({
    attemptKey: key,
    recoverySecret: "",
    storedHash
  }),
  false
)

assert.equal(
  verifyStorefrontRecoveryProof({
    attemptKey: key,
    recoverySecret: secret,
    storedHash: ""
  }),
  false
)

console.log("PASS: Missing credentials rejected")

assert.throws(
  () => hashStorefrontRecoveryProof({
    attemptKey: "invalid",
    recoverySecret: secret
  }),
  /Invalid storefront recovery proof/
)

assert.throws(
  () => hashStorefrontRecoveryProof({
    attemptKey: key,
    recoverySecret: "short"
  }),
  /Invalid storefront recovery proof/
)

console.log("PASS: Malformed recovery credentials rejected")

assert.notEqual(
  createStorefrontRecoverySecret(),
  createStorefrontRecoverySecret()
)

console.log("PASS: Independent attempts produce different secrets")