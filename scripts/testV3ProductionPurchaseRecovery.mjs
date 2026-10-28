import assert from "node:assert/strict"

import {
  assessV3ProductionPurchaseRecovery
} from "../utils/assessV3ProductionPurchaseRecovery.js"

const orderId = "507f191e810c19729de860ea"

const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const base = {
  environment: "production",
  orderId,
  purchaseKey,
  idempotencyKey: purchaseKey,
  status: "reserved",
  attemptClaimedAt: null
}

const assess = (reservation = base, operation = null) =>
  assessV3ProductionPurchaseRecovery({
    reservation,
    operation
  })

const initial = assess()

assert.equal(
  initial.action,
  "eligible_for_initial_claim_review"
)
assert.equal(initial.squareCreationAuthorized, false)
assert.equal(initial.retryAuthorized, false)

console.log("PASS: Unclaimed reservation permits review only")

const claimed = assess({
  ...base,
  status: "claim_pending",
  attemptClaimedAt: new Date()
})

assert.equal(
  claimed.action,
  "hold_for_reconciliation"
)

console.log("PASS: Claimed attempt requires reconciliation")

const interrupted = assess({
  ...base,
  status: "claim_pending"
})

assert.equal(
  interrupted.action,
  "hold_for_reconciliation"
)

console.log("PASS: Missing timestamp cannot bypass claim hold")

const inconsistent = assess({
  ...base,
  attemptClaimedAt: new Date()
})

assert.equal(
  inconsistent.action,
  "hold_for_reconciliation"
)

console.log("PASS: Claimed timestamp blocks reserved-state replay")

const reconciling = assess({
  ...base,
  status: "reconciliation_required"
})

assert.equal(
  reconciling.action,
  "hold_for_reconciliation"
)

console.log("PASS: Reconciliation state remains blocked")

const completed = assess({
  ...base,
  status: "completed"
})

assert.equal(
  completed.action,
  "already_completed"
)

console.log("PASS: Completed purchase cannot recreate payment")

const existingOperation = assess(base, {
  environment: "production",
  orderId,
  idempotencyKey: purchaseKey,
  status: "reconciliation_required"
})

assert.equal(
  existingOperation.action,
  "hold_for_reconciliation"
)

console.log("PASS: Existing operation requires reconciliation")

const mismatchedOperation = assess(base, {
  environment: "sandbox",
  orderId,
  idempotencyKey: purchaseKey
})

assert.equal(
  mismatchedOperation.action,
  "hold_for_reconciliation"
)

console.log("PASS: Cross-environment operation fails closed")

const unknown = assess({
  ...base,
  status: "unexpected_status"
})

assert.equal(
  unknown.action,
  "hold_for_reconciliation"
)

console.log("PASS: Unknown reservation status fails closed")

await assert.rejects(
  async () => assess({
    ...base,
    environment: "sandbox"
  }),
  /PRODUCTION_RESERVATION_REQUIRED/
)

console.log("PASS: Sandbox reservation rejected")

await assert.rejects(
  async () => assess({
    ...base,
    purchaseKey: "incorrect"
  }),
  /RESERVATION_IDENTITY_MISMATCH/
)

console.log("PASS: Incorrect purchase identity rejected")

for (const result of [
  initial,
  claimed,
  interrupted,
  inconsistent,
  reconciling,
  completed,
  existingOperation,
  mismatchedOperation,
  unknown
]) {
  assert.equal(result.squareCreationAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.databaseWriteAuthorized, false)
  assert.equal(Object.isFrozen(result), true)
}

console.log("PASS: No assessment authorizes Square or database writes")

console.log("")
console.log("PRODUCTION RECOVERY DECISION TESTS: PASSED")
console.log("NO DATABASE CONNECTION")
console.log("NO PAYMENT CREATION")
console.log("NO SQUARE CALLS")
console.log("NO AUTOMATIC RETRIES")
