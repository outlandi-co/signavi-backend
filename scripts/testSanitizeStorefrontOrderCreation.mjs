import test from "node:test"
import assert from "node:assert/strict"

import {
  sanitizeStorefrontOrderCreation
} from "../utils/sanitizeStorefrontOrderCreation.mjs"

const id = "507f1f77bcf86cd799439011"

test("returns only the checkout order identifier", () => {
  const result = sanitizeStorefrontOrderCreation({
    _id: id,
    status: "payment_required",
    storefront: "signavi_studio"
  })

  assert.deepEqual(result, { _id: id })
})

test("does not expose storefront recovery security fields", () => {
  const result = sanitizeStorefrontOrderCreation({
    _id: id,
    storefrontCreationAttemptKey: "secret-attempt",
    storefrontCreationFingerprint: "a".repeat(64),
    storefrontRecoveryProofHash: "b".repeat(64),
    storefrontRecoveryExpiresAt: new Date(),
    guestCheckoutTokenHash: "private"
  })

  assert.deepEqual(Object.keys(result), ["_id"])

  const serialized = JSON.stringify(result)

  for (const forbidden of [
    "storefrontCreationAttemptKey",
    "storefrontCreationFingerprint",
    "storefrontRecoveryProofHash",
    "storefrontRecoveryExpiresAt",
    "guestCheckoutTokenHash"
  ]) {
    assert.equal(serialized.includes(forbidden), false)
  }
})

test("accepts MongoDB-style ObjectId objects", () => {
  const result = sanitizeStorefrontOrderCreation({
    _id: {
      toString: () => id.toUpperCase()
    }
  })

  assert.deepEqual(result, { _id: id })
})

test("rejects missing order IDs", () => {
  assert.throws(
    () => sanitizeStorefrontOrderCreation({}),
    /Invalid storefront order identifier/
  )
})

test("rejects malformed identifiers", () => {
  assert.throws(
    () => sanitizeStorefrontOrderCreation({
      _id: "synthetic-order"
    }),
    /Invalid storefront order identifier/
  )
})

test("does not expose arbitrary document properties", () => {
  const result = sanitizeStorefrontOrderCreation({
    _id: id,
    customerName: "Test Customer",
    email: "test@example.invalid",
    items: [{ title: "Private Item" }],
    paymentDetails: { internalReference: "private" }
  })

  assert.deepEqual(result, { _id: id })
  assert.equal(Object.isFrozen(result), true)
})