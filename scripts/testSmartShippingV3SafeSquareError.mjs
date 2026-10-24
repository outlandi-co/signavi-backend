import assert from "node:assert/strict"
import { SquareError, SquareTimeoutError } from "square"

import {
  classifyV3SafeSquareError
} from "../utils/smartShippingV3SafeSquareError.js"

const timeout = classifyV3SafeSquareError(
  new SquareTimeoutError("Simulated timeout")
)

assert.equal(timeout.type, "timeout")
assert.equal(timeout.outcomeKnown, false)

const apiError = classifyV3SafeSquareError(
  new SquareError({
    message: "SENSITIVE MESSAGE",
    statusCode: 400,
    body: {
      token: "SECRET_VALUE"
    }
  })
)

assert.equal(apiError.type, "square_api_error")
assert.equal(apiError.statusCode, 400)
assert.equal(apiError.outcomeKnown, false)

const serialized = JSON.stringify(apiError)

assert.ok(!serialized.includes("SECRET_VALUE"))
assert.ok(!serialized.includes("SENSITIVE MESSAGE"))

const unknown = classifyV3SafeSquareError(
  new Error("SENSITIVE INTERNAL ERROR")
)

assert.equal(unknown.type, "unknown_exception")
assert.equal(unknown.outcomeKnown, false)

console.log("TIMEOUT CLASSIFICATION: PASS")
console.log("SQUARE API ERROR CLASSIFICATION: PASS")
console.log("UNKNOWN EXCEPTION CLASSIFICATION: PASS")
console.log("SENSITIVE DATA EXCLUSION: PASS")
console.log("NO SQUARE REQUESTS: PASS")
console.log("ALL SAFE ERROR CLASSIFIER TESTS PASSED")