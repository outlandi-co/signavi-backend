import assert from "node:assert/strict"
import {
  fingerprintStorefrontOrder
} from "../utils/storefrontOrderIdempotency.mjs"

import {
  isStorefrontAttemptDuplicate,
  resolveStorefrontAttemptConflict
} from "../utils/storefrontAttemptConflict.mjs"

const indexName = "unique_storefront_creation_attempt_v1"

const duplicate = () => ({
  code: 11000,
  index: indexName,
  keyPattern: { storefrontCreationAttemptKey: 1 }
})

const request = {
  email: "buyer@example.test",
  customerName: "Example Buyer",
  items: [{
    productId: "507f1f77bcf86cd799439011",
    quantity: 1
  }]
}

const fingerprint = fingerprintStorefrontOrder(request)

assert.equal(
  isStorefrontAttemptDuplicate(duplicate()),
  true
)

assert.equal(
  isStorefrontAttemptDuplicate({
    code: 11000,
    index: "email_1",
    keyPattern: { email: 1 }
  }),
  false
)

assert.equal(
  isStorefrontAttemptDuplicate({
    code: 11000,
    keyPattern: { storefrontCreationAttemptKey: 1 }
  }),
  false
)

console.log("PASS: Only the intended unique index is recognized")

const same = resolveStorefrontAttemptConflict({
  error: duplicate(),
  existingFingerprint: fingerprint,
  requestedFingerprint: fingerprint
})

assert.equal(same.status, "existing-attempt-requires-auth")
assert.equal(same.httpStatus, 409)
assert.equal(same.mayCreateAnotherOrder, false)
assert.equal(same.mayRevealOrder, false)

assert.equal("orderId" in same, false)
assert.equal("checkoutToken" in same, false)

console.log("PASS: Same-attempt collision does not reveal credentials")

const different = resolveStorefrontAttemptConflict({
  error: duplicate(),
  existingFingerprint: fingerprint,
  requestedFingerprint: fingerprintStorefrontOrder({
    ...request,
    email: "other@example.test"
  })
})

assert.equal(different.status, "attempt-conflict")
assert.equal(different.mayRevealOrder, false)

console.log("PASS: Changed customer information fails closed")

const unrelated = resolveStorefrontAttemptConflict({
  error: { code: 11000, keyPattern: { email: 1 } },
  existingFingerprint: fingerprint,
  requestedFingerprint: fingerprint
})

assert.equal(unrelated.status, "database-error")
assert.equal(unrelated.mayCreateAnotherOrder, false)

console.log("PASS: Unrelated database errors never authorize retry")

// Simulated atomic uniqueness; this is NOT a MongoDB concurrency test.
const records = new Map()

async function simulatedInsert(key, value) {
  if (records.has(key)) {
    throw duplicate()
  }

  // Synchronous reservation models the database uniqueness boundary.
  records.set(key, value)

  await Promise.resolve()

  return { created: true }
}

const attemptKey = "8d56de2b-e8f5-48f3-8e6c-3f8724ec779a"

const outcomes = await Promise.allSettled(
  Array.from({ length: 10 }, () =>
    simulatedInsert(attemptKey, fingerprint)
  )
)

const fulfilled = outcomes.filter(x => x.status === "fulfilled")
const rejected = outcomes.filter(x => x.status === "rejected")

assert.equal(fulfilled.length, 1)
assert.equal(rejected.length, 9)
assert.equal(records.size, 1)

for (const result of rejected) {
  const decision = resolveStorefrontAttemptConflict({
    error: result.reason,
    existingFingerprint: records.get(attemptKey),
    requestedFingerprint: fingerprint
  })

  assert.equal(
    decision.status,
    "existing-attempt-requires-auth"
  )
  assert.equal(decision.mayRevealOrder, false)
}

console.log("PASS: Simulated concurrent collisions fail closed")

assert.equal(
  resolveStorefrontAttemptConflict({
    error: duplicate(),
    existingFingerprint: undefined,
    requestedFingerprint: fingerprint
  }).status,
  "attempt-conflict"
)

console.log("PASS: Missing existing evidence cannot authorize recovery")