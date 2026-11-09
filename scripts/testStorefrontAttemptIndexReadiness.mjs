import assert from "node:assert/strict"

import {
  verifyStorefrontAttemptIndexReadiness
} from "../utils/verifyStorefrontAttemptIndexReadiness.mjs"

const validIndex = {
  name: "unique_storefront_creation_attempt_v1",
  key: { storefrontCreationAttemptKey: 1 },
  unique: true,
  partialFilterExpression: {
    storefrontCreationAttemptKey: { $type: "string" }
  }
}

const check = async indexes =>
  verifyStorefrontAttemptIndexReadiness({
    listIndexes: async () => indexes
  })

const ready = await check([
  { name: "_id_", key: { _id: 1 } },
  validIndex
])

assert.equal(ready.ready, true)
assert.equal(ready.mayCreateOrder, false)
assert.equal(ready.mayCreateIndex, false)
assert.equal(ready.mayExecutePayment, false)

console.log("PASS: Exact existing unique partial index recognized")

for (const indexes of [
  [],
  [{ ...validIndex, unique: false }],
  [{ ...validIndex, name: "wrong_index" }],
  [{ ...validIndex, key: { storefrontCreationAttemptKey: -1 } }],
  [{ ...validIndex, key: { storefrontCreationAttemptKey: 1, email: 1 } }],
  [{ ...validIndex, partialFilterExpression: undefined }],
  [{
    ...validIndex,
    partialFilterExpression: {
      storefrontCreationAttemptKey: { $exists: true }
    }
  }],
  [{ ...validIndex, sparse: true }],
  [{ ...validIndex, hidden: true }],
  [{
    ...validIndex,
    collation: { locale: "en", strength: 2 }
  }],
  [validIndex, validIndex]
]) {
  const result = await check(indexes)
  assert.equal(result.ready, false)
  assert.equal(result.mayCreateOrder, false)
}

console.log("PASS: Missing, mismatched or unsafe indexes rejected")

for (const listIndexes of [
  undefined,
  async () => null,
  async () => {
    throw new Error("Simulated database failure")
  }
]) {
  const result = await verifyStorefrontAttemptIndexReadiness({
    listIndexes
  })

  assert.equal(result.ready, false)
  assert.equal(result.mayCreateOrder, false)
}

console.log("PASS: Index inspection errors fail closed")

assert.deepEqual(
  Object.keys(ready).sort(),
  [
    "ready",
    "mayCreateOrder",
    "mayCreateIndex",
    "mayExecutePayment"
  ].sort()
)

console.log("PASS: Readiness never grants write or payment authority")