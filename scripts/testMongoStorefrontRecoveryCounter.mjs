import assert from "node:assert/strict"

import {
  createMongoStorefrontRecoveryCounter
} from "../utils/createMongoStorefrontRecoveryCounter.mjs"

import {
  evaluateStorefrontRecoveryRateLimit
} from "../utils/evaluateStorefrontRecoveryRateLimit.mjs"

const records = new Map()
const calls = []

const collection = {
  async findOneAndUpdate(filter, update, options) {
    calls.push({ filter, update, options })

    const previous = records.get(filter._id)

    const next = previous
      ? { ...previous, count: previous.count + 1 }
      : {
          _id: filter._id,
          count: 1,
          expiresAt: update.$setOnInsert.expiresAt
        }

    records.set(filter._id, next)

    return next
  }
}

let clock = 1000000

const increment = createMongoStorefrontRecoveryCounter({
  collection,
  now: () => clock
})

for (let i = 1; i <= 5; i++) {
  const decision = await evaluateStorefrontRecoveryRateLimit({
    key: "studio-test",
    increment
  })

  assert.equal(decision.allowed, true)
}

console.log("PASS: Five requests allowed")

const sixth = await evaluateStorefrontRecoveryRateLimit({
  key: "studio-test",
  increment
})

assert.equal(sixth.allowed, false)
assert.equal(sixth.reason, "rate-limited")

console.log("PASS: Sixth request blocked")

assert.equal(calls[0].options.upsert, true)
assert.equal(calls[0].options.returnDocument, "after")
assert.deepEqual(calls[0].update.$inc, { count: 1 })

console.log("PASS: Atomic increment contract")

const different = await evaluateStorefrontRecoveryRateLimit({
  key: "different-client",
  increment
})

assert.equal(different.allowed, true)

console.log("PASS: Different keys isolated")

clock += 15 * 60 * 1000

const renewed = await evaluateStorefrontRecoveryRateLimit({
  key: "studio-test",
  increment
})

assert.equal(renewed.allowed, true)

console.log("PASS: New window begins new counter")

const failed = createMongoStorefrontRecoveryCounter({
  collection: {
    async findOneAndUpdate() {
      throw new Error("MongoDB unavailable")
    }
  }
})

const rejected = await evaluateStorefrontRecoveryRateLimit({
  key: "studio-test",
  increment: failed
})

assert.equal(rejected.allowed, false)
assert.equal(rejected.reason, "storage-unavailable")

console.log("PASS: Database failure fails closed")

assert.ok(
  calls.every(call =>
    !call.filter._id.includes("studio-test") &&
    !call.filter._id.includes("different-client")
  )
)

console.log("PASS: Counter identifiers hashed")
console.log("PASS: Mongo recovery counter suite complete")
