import assert from "node:assert/strict"

import {
  evaluateV3ProductionExecutionPolicy
} from "../utils/v3ProductionExecutionPolicy.js"

const orderId = "507f1f77bcf86cd799439011"
const key = `signavi-v3-production-purchase-${orderId}`

const identity = () => ({
  environment: "production",
  reservation: {
    environment: "production",
    orderId,
    idempotencyKey: key,
    status: "reserved",
    attemptClaimedAt: null
  },
  operation: {
    environment: "production",
    orderId,
    idempotencyKey: key
  }
})

const cases = [
  ["first attempt", identity()],
  ["duplicate claimed attempt", {
    ...identity(),
    reservation: {
      ...identity().reservation,
      status: "reconciliation_required",
      attemptClaimedAt: new Date()
    }
  }],
  ["mismatched identity", {
    ...identity(),
    operation: {
      ...identity().operation,
      idempotencyKey: "wrong-key"
    }
  }],
  ["sandbox environment", {
    ...identity(),
    environment: "sandbox"
  }]
]

for (const [name, input] of cases) {
  const result = evaluateV3ProductionExecutionPolicy(input)

  assert.equal(result.authorized, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  console.log(`PASS: ${name} cannot create a Square link`)
}

console.log("PRODUCTION CHECKOUT CONTRACT: 4 TESTS PASSED")
console.log("NO SQUARE REQUESTS")
console.log("NO DATABASE WRITES")