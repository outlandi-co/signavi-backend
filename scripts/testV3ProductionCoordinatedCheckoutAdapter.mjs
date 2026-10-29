import assert from "node:assert/strict"

import {
  adaptV3ProductionCoordinatedCheckoutClaim
} from "../utils/adaptV3ProductionCoordinatedCheckoutClaim.js"

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const identity = {
  environment: "production",
  orderId,
  purchaseKey,
  idempotencyKey: purchaseKey,
  owner: "trusted-checkout-owner"
}

const successfulCoordination = {
  coordinated: true,
  blocked: false,
  purchaseKey,
  squareCreationAuthorized: false,
  retryAuthorized: false
}

const cases = [
  {
    name: "coordinated claim still requires trusted executor",
    input: { identity, coordinatedClaim: successfulCoordination },
    reason: "TRUSTED_PRODUCTION_EXECUTOR_REQUIRED"
  },
  {
    name: "rejected coordination blocked",
    input: {
      identity,
      coordinatedClaim: {
        ...successfulCoordination,
        coordinated: false
      }
    },
    reason: "COORDINATED_CLAIM_NOT_VERIFIED"
  },
  {
    name: "mismatched purchase key blocked",
    input: {
      identity,
      coordinatedClaim: {
        ...successfulCoordination,
        purchaseKey: "wrong-key"
      }
    },
    reason: "COORDINATED_CLAIM_NOT_VERIFIED"
  },
  {
    name: "unexpected payment authorization rejected",
    input: {
      identity,
      coordinatedClaim: {
        ...successfulCoordination,
        squareCreationAuthorized: true
      }
    },
    reason: "UNEXPECTED_EXECUTION_AUTHORIZATION"
  },
  {
    name: "invalid checkout identity blocked",
    input: {
      identity: { ...identity, owner: "" },
      coordinatedClaim: successfulCoordination
    },
    reason: "INVALID_CHECKOUT_IDENTITY"
  }
]

for (const item of cases) {
  const outcome =
    adaptV3ProductionCoordinatedCheckoutClaim(item.input)

  assert.equal(outcome.claimed, false)
  assert.equal(outcome.squareRequestAuthorized, false)
  assert.equal(outcome.retryAuthorized, false)
  assert.equal(outcome.reason, item.reason)
  assert.equal(Object.isFrozen(outcome), true)

  console.log(`PASS: ${item.name}`)
}

console.log("COORDINATED CHECKOUT ADAPTER: 5 TESTS PASSED")
console.log("NO SQUARE REQUESTS")
console.log("NO DATABASE WRITES")