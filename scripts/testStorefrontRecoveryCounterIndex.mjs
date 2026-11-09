import assert from "node:assert/strict"

import {
  verifyStorefrontRecoveryCounterIndex,
  STOREFRONT_RECOVERY_TTL_INDEX
} from "../utils/verifyStorefrontRecoveryCounterIndex.mjs"

const valid = {
  name: STOREFRONT_RECOVERY_TTL_INDEX.name,
  key: { expiresAt: 1 },
  expireAfterSeconds: 0
}

async function check(indexes) {
  return verifyStorefrontRecoveryCounterIndex({
    listIndexes: async () => indexes
  })
}

assert.equal(
  (await check([valid])).ready,
  true
)
console.log("PASS: Correct TTL index accepted")

assert.equal(
  (await check([])).ready,
  false
)
console.log("PASS: Missing index rejected")

assert.equal(
  (await check([{
    ...valid,
    expireAfterSeconds: 3600
  }])).ready,
  false
)
console.log("PASS: Incorrect expiration rejected")

assert.equal(
  (await check([{
    ...valid,
    key: { createdAt: 1 }
  }])).ready,
  false
)
console.log("PASS: Incorrect index key rejected")

assert.equal(
  (await check([{
    ...valid,
    unique: true
  }])).ready,
  false
)
console.log("PASS: Unexpected unique index rejected")

assert.equal(
  (await check([{
    ...valid,
    partialFilterExpression: {
      enabled: true
    }
  }])).ready,
  false
)
console.log("PASS: Partial index rejected")

assert.equal(
  (await check([valid, valid])).ready,
  false
)
console.log("PASS: Duplicate index definitions rejected")

const failed = await verifyStorefrontRecoveryCounterIndex({
  listIndexes: async () => {
    throw new Error("Database unavailable")
  }
})

assert.equal(failed.ready, false)
console.log("PASS: Database inspection failure rejected")

console.log("PASS: Recovery counter index suite complete")
