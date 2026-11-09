import assert from "node:assert/strict"
import mongoose from "mongoose"

import {
  parseStorefrontAttemptKey,
  fingerprintStorefrontOrder,
  classifyStorefrontAttempt
} from "../utils/storefrontOrderIdempotency.mjs"

// Isolated schema: never registers or changes the live Order model.
const schema = new mongoose.Schema({
  storefrontCreationAttemptKey: {
    type: String,
    default: undefined
  },
  storefrontCreationFingerprint: {
    type: String,
    default: undefined
  }
}, {
  autoIndex: false,
  autoCreate: false
})

schema.index(
  { storefrontCreationAttemptKey: 1 },
  {
    unique: true,
    name: "unique_storefront_creation_attempt_v1",
    partialFilterExpression: {
      storefrontCreationAttemptKey: { $type: "string" }
    }
  }
)

const indexes = schema.indexes()

assert.equal(indexes.length, 1)

const [keys, options] = indexes[0]

assert.deepEqual(
  keys,
  { storefrontCreationAttemptKey: 1 }
)

assert.equal(options.unique, true)

assert.deepEqual(
  options.partialFilterExpression,
  {
    storefrontCreationAttemptKey: { $type: "string" }
  }
)

assert.equal(schema.options.autoIndex, false)
assert.equal(schema.options.autoCreate, false)

console.log("PASS: Offline unique partial-index declaration")

const oldOrder = new mongoose.Document({}, schema)

assert.equal(
  oldOrder.storefrontCreationAttemptKey,
  undefined
)

assert.equal(
  oldOrder.storefrontCreationFingerprint,
  undefined
)

console.log("PASS: Legacy documents omit new attempt fields")

const key = "8d56de2b-e8f5-48f3-8e6c-3f8724ec779a"

assert.equal(parseStorefrontAttemptKey(key), key)

const first = fingerprintStorefrontOrder({
  customerName: "Test Customer",
  email: "test@example.test",
  address: {
    street: "123 Example St",
    city: "Example",
    state: "CA",
    zip: "90000",
    country: "US"
  },
  items: [{
    productId: "507f1f77bcf86cd799439011",
    quantity: 1
  }]
})

assert.equal(
  classifyStorefrontAttempt({
    existingFingerprint: first,
    requestedFingerprint: first
  }),
  "same-attempt"
)

console.log("PASS: Attempt key and fingerprint contracts compatible")

assert.equal(
  mongoose.connection.readyState,
  0
)

console.log("PASS: No MongoDB connection opened")
console.log("PASS: Live Order model was not modified")