import assert from "node:assert/strict"
import mongoose from "mongoose"
import { randomUUID } from "node:crypto"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/

// Isolated schema only. Never imports or modifies Order.js.
const schema = new mongoose.Schema({
  storefrontCreationAttemptKey: {
    type: String,
    default: undefined,
    immutable: true,
    validate: {
      validator: value => value == null || UUID.test(value),
      message: "Invalid attempt key"
    }
  },
  storefrontCreationFingerprint: {
    type: String,
    default: undefined,
    immutable: true,
    match: SHA256
  },
  storefrontRecoveryProofHash: {
    type: String,
    default: undefined,
    immutable: true,
    match: SHA256
  },
  storefrontRecoveryExpiresAt: {
    type: Date,
    default: undefined,
    immutable: true
  }
}, {
  timestamps: true,
  autoIndex: false,
  autoCreate: false
})

assert.equal(schema.indexes().length, 0)
assert.equal(schema.options.autoIndex, false)
assert.equal(schema.options.autoCreate, false)

console.log("PASS: Isolated schema has no database indexes")

const legacy = new mongoose.Document({}, schema)

for (const field of [
  "storefrontCreationAttemptKey",
  "storefrontCreationFingerprint",
  "storefrontRecoveryProofHash",
  "storefrontRecoveryExpiresAt"
]) {
  assert.equal(legacy.get(field), undefined)
}

console.log("PASS: Legacy documents require no recovery fields")

const attemptKey = randomUUID()
const expiresAt = new Date("2026-11-14T12:00:00Z")

const record = new mongoose.Document({
  storefrontCreationAttemptKey: attemptKey,
  storefrontCreationFingerprint: "a".repeat(64),
  storefrontRecoveryProofHash: "b".repeat(64),
  storefrontRecoveryExpiresAt: expiresAt
}, schema)

assert.equal(await record.validate(), undefined)
assert.equal(
  record.get("storefrontRecoveryExpiresAt").toISOString(),
  expiresAt.toISOString()
)

console.log("PASS: Valid attempt and expiration accepted")

const invalidKey = new mongoose.Document({
  storefrontCreationAttemptKey: "invalid"
}, schema)

await assert.rejects(invalidKey.validate(), /Invalid attempt key/)

const invalidHash = new mongoose.Document({
  storefrontCreationFingerprint: "not-a-hash"
}, schema)

await assert.rejects(invalidHash.validate())

console.log("PASS: Invalid attempt keys and fingerprints rejected")

for (const field of [
  "storefrontCreationAttemptKey",
  "storefrontCreationFingerprint",
  "storefrontRecoveryProofHash",
  "storefrontRecoveryExpiresAt"
]) {
  assert.equal(schema.path(field).options.immutable, true)
}

assert.equal(schema.path("recoverySecret"), undefined)
assert.equal(schema.path("checkoutToken"), undefined)

console.log("PASS: Recovery metadata is immutable; no plaintext secret field")

assert.equal(mongoose.connection.readyState, 0)

console.log("PASS: No MongoDB connection opened")
console.log("PASS: Live Order model not imported or modified")