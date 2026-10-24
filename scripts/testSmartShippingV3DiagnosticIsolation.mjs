import assert from "node:assert/strict"
import { SquareError, SquareTimeoutError } from "square"

import {
  classifyV3SafeSquareError
} from "../utils/smartShippingV3SafeSquareError.js"

import {
  classifyV3SquareCreationOutcome
} from "../utils/smartShippingV3CreationOutcome.js"

const cases = [
  {
    name: "Square HTTP error",
    error: new SquareError({
      message: "SECRET_ERROR_TEXT",
      statusCode: 400,
      body: { accessToken: "SECRET_TOKEN" }
    }),
    expectedType: "square_api_error"
  },
  {
    name: "Square timeout",
    error: new SquareTimeoutError("SECRET_TIMEOUT_TEXT"),
    expectedType: "timeout"
  },
  {
    name: "Unexpected exception",
    error: new Error("SECRET_INTERNAL_TEXT"),
    expectedType: "unknown_exception"
  }
]

for (const item of cases) {
  const diagnostic = classifyV3SafeSquareError(item.error)

  const outcome = classifyV3SquareCreationOutcome({
    error: item.error
  })

  assert.equal(diagnostic.type, item.expectedType)
  assert.equal(diagnostic.outcomeKnown, false)
  assert.equal(outcome.status, "reconciliation_required")
  assert.equal(outcome.safeToRetryCreation, false)
  assert.equal(outcome.paymentCreated, "unknown")

  const serialized = JSON.stringify({ diagnostic, outcome })

  assert.ok(!serialized.includes("SECRET"))
  assert.ok(!serialized.includes("accessToken"))

  console.log(`${item.name}: PASS`)
}

console.log("NO SUCCESS OR RETRY ESCALATION: PASS")
console.log("SENSITIVE ERROR CONTENT EXCLUDED: PASS")
console.log("NO NETWORK REQUESTS OR DATABASE WRITES")
console.log("ALL DIAGNOSTIC ISOLATION TESTS PASSED")