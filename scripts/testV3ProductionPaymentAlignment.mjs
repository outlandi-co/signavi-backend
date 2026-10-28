import assert from "node:assert/strict"

import {
  verifyV3ProductionPaymentAlignment
} from "../utils/verifyV3ProductionPaymentAlignment.js"

const orderId = "507f191e810c19729de860ea"
const invoiceId = "507f191e810c19729de860eb"

const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const reservation = {
  environment: "production",
  orderId,
  purchaseKey,
  idempotencyKey: purchaseKey,
  claimedByDocumentType: "invoice",
  claimedByDocumentId: invoiceId,
  status: "reserved",
  attemptClaimedAt: null
}

const operation = {
  environment: "production",
  orderId,
  idempotencyKey: purchaseKey,
  status: "pending",
  squareCreationAttemptClaimedAt: null
}

const check = (r = reservation, o = operation) =>
  verifyV3ProductionPaymentAlignment({
    reservation: r,
    operation: o
  })

const aligned = check()

assert.equal(aligned.aligned, true)
assert.equal(aligned.state, "unclaimed")
console.log("PASS: Canonical identities aligned")

assert.equal(aligned.squareCreationAuthorized, false)
console.log("PASS: Alignment grants no Square permission")

const wrongOrder = check(reservation, {
  ...operation,
  orderId: "507f191e810c19729de860ec"
})

assert.equal(wrongOrder.aligned, false)
console.log("PASS: Conflicting operation order rejected")

const wrongKey = check(reservation, {
  ...operation,
  idempotencyKey: "signavi-v3-production-other"
})

assert.equal(wrongKey.aligned, false)
console.log("PASS: Conflicting idempotency key rejected")

const sandbox = check(reservation, {
  ...operation,
  environment: "sandbox"
})

assert.equal(sandbox.aligned, false)
console.log("PASS: Sandbox operation rejected")

const missing = check(reservation, null)

assert.equal(missing.aligned, false)
console.log("PASS: Missing operation rejected")

const claimed = check({
  ...reservation,
  status: "claim_pending",
  attemptClaimedAt: new Date()
})

assert.equal(claimed.state, "reconciliation_hold")
console.log("PASS: Claimed reservation held")

const uncertain = check(reservation, {
  ...operation,
  status: "reconciliation_required",
  squareCreationAttemptClaimedAt: new Date()
})

assert.equal(uncertain.state, "reconciliation_hold")
console.log("PASS: Uncertain Square attempt held")

const completed = check({
  ...reservation,
  status: "completed",
  attemptClaimedAt: new Date()
}, {
  ...operation,
  status: "completed",
  squareCreationAttemptClaimedAt: new Date()
})

assert.equal(completed.state, "reconciliation_hold")
console.log("PASS: Completed purchase cannot be re-executed")

const invalidStatus = check(reservation, {
  ...operation,
  status: "unexpected"
})

assert.equal(invalidStatus.aligned, false)
console.log("PASS: Unknown operation state rejected")

for (const result of [
  aligned,
  wrongOrder,
  wrongKey,
  sandbox,
  missing,
  claimed,
  uncertain,
  completed,
  invalidStatus
]) {
  assert.equal(result.squareCreationAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.databaseWriteAuthorized, false)
  assert.equal(Object.isFrozen(result), true)
}

console.log("PASS: Every result denies execution")

console.log("")
console.log("PRODUCTION PAYMENT ALIGNMENT: 10 TESTS PASSED")
console.log("NO DATABASE CONNECTION")
console.log("NO SQUARE CALLS")
console.log("NO PAYMENT CREATION")
