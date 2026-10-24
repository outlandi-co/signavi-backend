import assert from "node:assert/strict"
import {
  simulateReservedSquarePaymentCreation as simulate
} from "../utils/simulateReservedSquarePaymentCreation.js"

process.env.NODE_ENV = "test"

const orderId = "507f1f77bcf86cd799439090"
const environment = "sandbox"
const amountCents = 100

const preparation = {
  prepared: true,
  orderId,
  environment,
  amountCents,
  owner: "synthetic-test-owner",
  idempotencyKey: `signavi-${environment}-${orderId}`,
  squareRequestAuthorized: false,
  paymentCreated: false
}

let calls = 0

const fakeCreatePaymentLink = async () => {
  calls++
  return {
    id: "synthetic-link",
    orderId: "synthetic-square-order",
    url: "https://example.invalid/test-only"
  }
}

const run = value => simulate({
  preparation: value,
  orderId,
  environment,
  amountCents,
  fakeCreatePaymentLink
})

for (const value of [
  null,
  { ...preparation, prepared: false },
  { ...preparation, owner: "" },
  { ...preparation, amountCents: 200 },
  { ...preparation, environment: "production" },
  { ...preparation, idempotencyKey: "wrong-key" },
  { ...preparation, squareRequestAuthorized: true },
  { ...preparation, paymentCreated: true }
]) {
  const result = await run(value)

  assert.equal(result.blocked, true)
  assert.equal(result.squareRequestAuthorized, false)
}

assert.equal(calls, 0)
console.log("INVALID RESERVATIONS: BLOCKED")

const valid = await run(preparation)

assert.equal(valid.simulated, true)
assert.equal(valid.blocked, false)
assert.equal(valid.squareRequestAuthorized, false)
assert.equal(calls, 1)
console.log("FAKE EXECUTION: PASS")

const incomplete = await simulate({
  preparation,
  orderId,
  environment,
  amountCents,
  fakeCreatePaymentLink: async () => ({ id: "incomplete" })
})

assert.equal(incomplete.reconciliationRequired, true)
assert.equal(incomplete.blocked, true)
console.log("INCOMPLETE RESPONSE: QUARANTINED")

const uncertain = await simulate({
  preparation,
  orderId,
  environment,
  amountCents,
  fakeCreatePaymentLink: async () => {
    throw new Error("Synthetic network uncertainty")
  }
})

assert.equal(uncertain.reconciliationRequired, true)
assert.equal(uncertain.blocked, true)
console.log("UNCERTAIN RESULT: QUARANTINED")

process.env.NODE_ENV = "production"

await assert.rejects(
  run(preparation),
  /Test-only execution is disabled/
)

assert.equal(calls, 1)
console.log("PRODUCTION EXECUTION: DISABLED")
console.log("ALL GUARDED EXECUTION TESTS PASSED")
console.log("NO DATABASE OR SQUARE REQUESTS")