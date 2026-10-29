import assert from "node:assert/strict"

import {
  evaluateV3ProductionExecutionPolicy
} from "../utils/v3ProductionExecutionPolicy.js"

const orderId = "507f1f77bcf86cd799439011"
const idempotencyKey =
  `signavi-v3-production-purchase-${orderId}`

const cases = [
  {
    name: "matched production identity",
    input: {
      environment: "production",
      reservation: {
        environment: "production",
        orderId,
        idempotencyKey
      },
      operation: {
        environment: "production",
        orderId,
        idempotencyKey
      }
    },
    reason: "PRODUCTION_EXECUTION_NOT_IMPLEMENTED"
  },
  {
    name: "missing reservation",
    input: {
      environment: "production",
      operation: {
        environment: "production",
        orderId,
        idempotencyKey
      }
    },
    reason: "PRODUCTION_IDENTITY_NOT_VERIFIED"
  },
  {
    name: "sandbox environment",
    input: {
      environment: "sandbox",
      reservation: {
        environment: "production",
        orderId,
        idempotencyKey
      },
      operation: {
        environment: "production",
        orderId,
        idempotencyKey
      }
    },
    reason: "PRODUCTION_IDENTITY_NOT_VERIFIED"
  },
  {
    name: "mismatched idempotency identity",
    input: {
      environment: "production",
      reservation: {
        environment: "production",
        orderId,
        idempotencyKey
      },
      operation: {
        environment: "production",
        orderId,
        idempotencyKey: "different-key"
      }
    },
    reason: "PRODUCTION_IDENTITY_NOT_VERIFIED"
  }
]

for (const testCase of cases) {
  const result =
    evaluateV3ProductionExecutionPolicy(testCase.input)

  assert.equal(result.authorized, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.reason, testCase.reason)
  assert.equal(Object.isFrozen(result), true)

  console.log(`PASS: ${testCase.name}`)
}

console.log("PRODUCTION EXECUTION POLICY: 4 TESTS PASSED")