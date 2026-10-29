import assert from "node:assert/strict"

import {
  inspectV3ProductionCheckoutExecution
} from "../utils/v3ProductionCheckoutExecutionBoundary.js"

const orderId = "507f1f77bcf86cd799439011"
const key = `signavi-v3-production-purchase-${orderId}`

function fixture() {
  return {
    reservation: {
      environment: "production",
      orderId,
      purchaseKey: key,
      idempotencyKey: key,
      status: "claim_pending",
      attemptClaimedAt: new Date()
    },
    operation: {
      environment: "production",
      orderId,
      idempotencyKey: key,
      status: "claimed"
    }
  }
}

const cases = [
  {
    name: "claimed payment identity",
    input: fixture(),
    expected: true
  },
  {
    name: "unclaimed payment",
    input: {
      ...fixture(),
      reservation: {
        ...fixture().reservation,
        attemptClaimedAt: null
      }
    },
    expected: false
  },
  {
    name: "duplicate requiring reconciliation",
    input: {
      ...fixture(),
      reservation: {
        ...fixture().reservation,
        status: "reconciliation_required"
      }
    },
    expected: false
  },
  {
    name: "mismatched payment identity",
    input: {
      ...fixture(),
      operation: {
        ...fixture().operation,
        idempotencyKey: "wrong-key"
      }
    },
    expected: false
  },
  {
    name: "completed payment",
    input: {
      ...fixture(),
      reservation: {
        ...fixture().reservation,
        status: "completed"
      }
    },
    expected: false
  }
]

for (const item of cases) {
  const result =
    inspectV3ProductionCheckoutExecution(item.input)

  assert.equal(
    result.eligibleForExecutionReview,
    item.expected
  )

  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(Object.isFrozen(result), true)

  console.log(`PASS: ${item.name}`)
}

console.log("CHECKOUT EXECUTION BOUNDARY: 5 TESTS PASSED")
console.log("NO SQUARE REQUESTS")
console.log("NO DATABASE WRITES")