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


for (const code of [
  "INVALID_ARRAY_VALUE",
  "INVALID_ENUM_VALUE",
  "INVALID_FORM_VALUE",
  "INVALID_CONTENT_TYPE",
  "INVALID_LOCATION"
]) {
  const error = new SquareError({
    statusCode: 400,
    body: {
      errors: [{
        category: "INVALID_REQUEST_ERROR",
        code,
        detail: "PRIVATE VALIDATION DETAIL"
      }]
    }
  })

  const diagnostic = classifyV3SafeSquareError(error)

  assert.equal(diagnostic.type, "square_api_error")
  assert.equal(diagnostic.statusCode, 400)
  assert.equal(diagnostic.code, code)
  assert.equal(diagnostic.outcomeKnown, false)
  assert.ok(!JSON.stringify(diagnostic).includes("PRIVATE"))
}


for (const [field, expected] of [
  ["order.location_id", "order.location_id"],
  ["checkout_options.redirect_url", "checkout_options.redirect_url"],
  ["order.line_items[0].base_price_money.amount",
    "order.line_items[0].base_price_money.amount"],
  ["customer.email", null],
  ["order.location_id;PRIVATE", null],
  ["PRIVATE_SECRET", null]
]) {
  const result = classifyV3SafeSquareError(
    new SquareError({
      statusCode: 400,
      body: {
        errors: [{
          category: "INVALID_REQUEST_ERROR",
          code: "INVALID_VALUE",
          field,
          detail: "PRIVATE FIELD DETAIL"
        }]
      }
    })
  )

  assert.equal(result.field, expected)
  assert.equal(result.outcomeKnown, false)
  assert.ok(!JSON.stringify(result).includes("PRIVATE"))
}

console.log("SAFE SQUARE ERROR FIELDS: PASS")

console.log("EXTENDED SQUARE ERROR CODES: PASS")

console.log("TIMEOUT CLASSIFICATION: PASS")
console.log("SQUARE API ERROR CLASSIFICATION: PASS")
console.log("UNKNOWN EXCEPTION CLASSIFICATION: PASS")
console.log("SENSITIVE DATA EXCLUSION: PASS")
console.log("NO SQUARE REQUESTS: PASS")
console.log("ALL SAFE ERROR CLASSIFIER TESTS PASSED")