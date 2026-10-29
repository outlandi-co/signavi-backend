import assert from "node:assert/strict"

import {
  decideV3ProductionCheckout
} from "../utils/v3ProductionCheckoutDecision.js"

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

const checks = [
  {
    name: "claimed checkout requires trusted executor",
    input: fixture(),
    status: 423,
    action: "trusted_execution_required"
  },
  {
    name: "unclaimed checkout blocked",
    input: {
      ...fixture(),
      reservation: {
        ...fixture().reservation,
        attemptClaimedAt: null
      }
    },
    status: 423,
    action: "hold_for_reconciliation"
  },
  {
    name: "completed checkout rejected",
    input: {
      ...fixture(),
      reservation: {
        ...fixture().reservation,
        status: "completed"
      }
    },
    status: 409,
    action: "already_completed"
  },
  {
    name: "uncertain checkout blocked",
    input: {
      ...fixture(),
      reservation: {
        ...fixture().reservation,
        status: "reconciliation_required"
      }
    },
    status: 423,
    action: "hold_for_reconciliation"
  }
]

for (const item of checks) {
  const result = decideV3ProductionCheckout(item.input)

  assert.equal(result.status, item.status)
  assert.equal(result.action, item.action)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(Object.isFrozen(result), true)

  console.log(`PASS: ${item.name}`)
}

console.log("CHECKOUT DECISION: 4 TESTS PASSED")
console.log("NO SQUARE REQUESTS")
console.log("NO DATABASE WRITES")