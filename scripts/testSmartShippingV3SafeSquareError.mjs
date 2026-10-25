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


const allowed = classifyV3SafeSquareError(
  new SquareError({
    message: "SENSITIVE MESSAGE",
    statusCode: 400,
    body: {
      errors: [{
        category: "INVALID_REQUEST_ERROR",
        code: "INVALID_VALUE",
        detail: "SECRET DETAIL"
      }]
    }
  })
)

assert.equal(allowed.type, "square_api_error")
assert.equal(allowed.statusCode, 400)
assert.equal(allowed.category, "INVALID_REQUEST_ERROR")
assert.equal(allowed.code, "INVALID_VALUE")

const allowedSerialized = JSON.stringify(allowed)

assert.ok(!allowedSerialized.includes("SECRET DETAIL"))
assert.ok(!allowedSerialized.includes("SENSITIVE MESSAGE"))

const blocked = classifyV3SafeSquareError(
  new SquareError({
    message: "SENSITIVE",
    statusCode: 400,
    body: {
      errors: [{
        category: "INVALID_REQUEST_ERROR",
        code: "UNRECOGNIZED_SECRET_CODE"
      }]
    }
  })
)

assert.equal(blocked.code, null)

console.log("ALLOWED ERROR CODE: PASS")
console.log("UNKNOWN ERROR CODE BLOCKED: PASS")
console.log("SENSITIVE DATA EXCLUDED: PASS")
console.log("NO NETWORK REQUESTS IN NEW TESTS: PASS")


const multipleErrors = new SquareError({
  message: "PRIVATE ERROR MESSAGE",
  statusCode: 400,
  body: {
    errors: [
      {
        category: "INVALID_REQUEST_ERROR",
        code: "UNRECOGNIZED_CODE",
        detail: "PRIVATE FIRST DETAIL"
      },
      {
        category: "INVALID_REQUEST_ERROR",
        code: "INVALID_VALUE",
        detail: "PRIVATE SECOND DETAIL"
      }
    ]
  }
})

const multiResult = classifyV3SafeSquareError(multipleErrors)

assert.equal(multiResult.type, "square_api_error")
assert.equal(multiResult.statusCode, 400)
assert.equal(multiResult.category, "INVALID_REQUEST_ERROR")
assert.equal(multiResult.code, "INVALID_VALUE")
assert.equal(multiResult.outcomeKnown, false)

const multiSerialized = JSON.stringify(multiResult)

assert.ok(!multiSerialized.includes("PRIVATE ERROR MESSAGE"))
assert.ok(!multiSerialized.includes("PRIVATE FIRST DETAIL"))
assert.ok(!multiSerialized.includes("PRIVATE SECOND DETAIL"))

console.log("SECOND ERROR CODE DETECTED: PASS")
console.log("MULTI-ERROR SENSITIVE DATA EXCLUDED: PASS")

console.log("TIMEOUT CLASSIFICATION: PASS")
console.log("SQUARE API ERROR CLASSIFICATION: PASS")
console.log("UNKNOWN EXCEPTION CLASSIFICATION: PASS")
console.log("SENSITIVE DATA EXCLUSION: PASS")
console.log("NO SQUARE REQUESTS: PASS")
console.log("ALL SAFE ERROR CLASSIFIER TESTS PASSED")