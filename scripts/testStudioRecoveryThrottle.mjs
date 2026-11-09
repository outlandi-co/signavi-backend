import assert from "node:assert/strict"

import {
  checkStudioRecoveryThrottle
} from "../utils/checkStudioRecoveryThrottle.mjs"

const validIndex = {
  name: "storefront_recovery_expires_ttl_v1",
  key: { expiresAt: 1 },
  expireAfterSeconds: 0
}

function makeCollection({
  indexes = [validIndex],
  fail = false
} = {}) {
  const counts = new Map()

  return {
    listIndexes() {
      return {
        async toArray() {
          if (fail) throw new Error("Unavailable")
          return indexes
        }
      }
    },

    async findOneAndUpdate(filter) {
      if (fail) throw new Error("Unavailable")

      const count = (counts.get(filter._id) || 0) + 1
      counts.set(filter._id, count)

      return { _id: filter._id, count }
    }
  }
}

const collection = makeCollection()

for (let i = 0; i < 5; i++) {
  const result = await checkStudioRecoveryThrottle({
    collection,
    clientKey: "test-client",
    attemptKey: "test-attempt"
  })

  assert.equal(result.allowed, true)
}

console.log("PASS: Five requests allowed")

const sixth = await checkStudioRecoveryThrottle({
  collection,
  clientKey: "test-client",
  attemptKey: "test-attempt"
})

assert.equal(sixth.allowed, false)
console.log("PASS: Attempt budget enforced")

const missingIndex = await checkStudioRecoveryThrottle({
  collection: makeCollection({ indexes: [] }),
  clientKey: "client",
  attemptKey: "attempt"
})

assert.equal(missingIndex.allowed, false)
console.log("PASS: Missing TTL index rejected")

const unavailable = await checkStudioRecoveryThrottle({
  collection: makeCollection({ fail: true }),
  clientKey: "client",
  attemptKey: "attempt"
})

assert.equal(unavailable.allowed, false)
console.log("PASS: Storage failure rejected")

const invalid = await checkStudioRecoveryThrottle({
  collection: makeCollection(),
  clientKey: "",
  attemptKey: "attempt"
})

assert.equal(invalid.allowed, false)
console.log("PASS: Missing client identity rejected")

const sharedClient = makeCollection()

for (let i = 0; i < 20; i++) {
  const result = await checkStudioRecoveryThrottle({
    collection: sharedClient,
    clientKey: "same-client",
    attemptKey: `attempt-${i}`
  })

  assert.equal(result.allowed, true)
}

const twentyFirst = await checkStudioRecoveryThrottle({
  collection: sharedClient,
  clientKey: "same-client",
  attemptKey: "attempt-20"
})

assert.equal(twentyFirst.allowed, false)
console.log("PASS: Client budget enforced across attempts")

console.log("PASS: Studio recovery throttle suite complete")
