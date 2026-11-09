import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

import {
  parseStorefrontAttemptKey,
  fingerprintStorefrontOrder,
  classifyStorefrontAttempt
} from "../utils/storefrontOrderIdempotency.mjs"

const key = randomUUID()

assert.equal(
  parseStorefrontAttemptKey(key.toUpperCase()),
  key
)

assert.equal(parseStorefrontAttemptKey("invalid"), null)
assert.equal(parseStorefrontAttemptKey(""), null)
assert.equal(parseStorefrontAttemptKey(null), null)

console.log("PASS: UUID v4 attempt keys validated")

const base = {
  customerName: "Test Customer",
  email: "customer@example.test",
  phone: "5550000000",
  address: {
    street: "123 Test Street",
    city: "Example",
    state: "CA",
    zip: "90000",
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

const first = fingerprintStorefrontOrder(base)

const second = fingerprintStorefrontOrder({
  ...base,
  email: "CUSTOMER@EXAMPLE.TEST",
  address: {
    country: "US",
    zip: "90000",
    state: "CA",
    city: "Example",
    street: "123 Test Street"
  }
})

assert.equal(first, second)

console.log("PASS: Equivalent requests have stable fingerprints")

assert.notEqual(
  first,
  fingerprintStorefrontOrder({
    ...base,
    items: [{
      ...base.items[0],
      quantity: 3
    }]
  })
)

assert.notEqual(
  first,
  fingerprintStorefrontOrder({
    ...base,
    address: {
      ...base.address,
      zip: "90001"
    }
  })
)

console.log("PASS: Changed quantity or address changes fingerprint")

assert.equal(
  classifyStorefrontAttempt({
    existingFingerprint: first,
    requestedFingerprint: first
  }),
  "same-attempt"
)

assert.equal(
  classifyStorefrontAttempt({
    existingFingerprint: null,
    requestedFingerprint: first
  }),
  "new"
)

console.log("PASS: Identical retry classified correctly")

assert.equal(
  classifyStorefrontAttempt({
    existingFingerprint: first,
    requestedFingerprint: fingerprintStorefrontOrder({
      ...base,
      email: "different@example.test"
    })
  }),
  "conflict"
)

assert.equal(
  classifyStorefrontAttempt({
    existingFingerprint: first,
    requestedFingerprint: "invalid"
  }),
  "invalid"
)

console.log("PASS: Customer changes and invalid fingerprints rejected")

assert.throws(
  () => fingerprintStorefrontOrder({
    ...base,
    items: []
  }),
  /Incomplete/
)

assert.throws(
  () => fingerprintStorefrontOrder({
    ...base,
    items: [{
      productId: base.items[0].productId,
      quantity: Infinity
    }]
  }),
  /Invalid numeric/
)

console.log("PASS: Invalid request values rejected")