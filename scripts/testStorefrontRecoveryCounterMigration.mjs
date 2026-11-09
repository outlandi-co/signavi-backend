import assert from "node:assert/strict"

import {
  planStorefrontRecoveryCounterMigration
} from "../utils/planStorefrontRecoveryCounterMigration.mjs"

const expected = {
  name: "storefront_recovery_expires_ttl_v1",
  key: { expiresAt: 1 },
  expireAfterSeconds: 0
}

const check = indexes =>
  planStorefrontRecoveryCounterMigration({
    listIndexes: async () => indexes
  })

const ready = await check([expected])
assert.equal(ready.action, "none")
assert.equal(ready.safe, true)
console.log("PASS: Existing correct index accepted")

const missing = await check([
  { name: "_id_", key: { _id: 1 } }
])

assert.equal(missing.action, "provision-required")
assert.equal(missing.safe, true)
assert.deepEqual(missing.specification.key, {
  expiresAt: 1
})
console.log("PASS: Missing index identified")

const wrongTTL = await check([{
  ...expected,
  expireAfterSeconds: 3600
}])

assert.equal(wrongTTL.action, "stop")
console.log("PASS: Incorrect TTL configuration blocked")

const wrongName = await check([{
  name: "another_expiration_index",
  key: { expiresAt: 1 },
  expireAfterSeconds: 0
}])

assert.equal(wrongName.action, "stop")
console.log("PASS: Conflicting index name blocked")

const unavailable =
  await planStorefrontRecoveryCounterMigration({
    listIndexes: async () => {
      throw new Error("Unavailable")
    }
  })

assert.equal(unavailable.safe, false)
console.log("PASS: Inspection failures blocked")

let writes = 0

const mockCollection = {
  async listIndexes() {
    return [expected]
  },
  async createIndex() {
    writes++
    throw new Error("Unexpected write")
  }
}

const dryRun =
  await planStorefrontRecoveryCounterMigration({
    listIndexes: () => mockCollection.listIndexes()
  })

assert.equal(dryRun.action, "none")
assert.equal(writes, 0)

console.log("PASS: No database writes performed")
console.log("PASS: Migration planning suite complete")
