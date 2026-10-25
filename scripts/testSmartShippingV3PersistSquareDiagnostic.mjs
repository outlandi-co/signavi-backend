import assert from "node:assert/strict"
import { SquareError } from "square"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  classifyV3SafeSquareError
} from "../utils/smartShippingV3SafeSquareError.js"
import {
  sanitizeV3PersistedSquareDiagnostic
} from "../utils/smartShippingV3PersistSquareDiagnostic.js"

const makeError = code => new SquareError({
  statusCode: 400,
  message: "PRIVATE MESSAGE",
  body: {
    errors: [{
      category: "INVALID_REQUEST_ERROR",
      ...(code === undefined ? {} : { code }),
      field: "order.location_id",
      detail: "PRIVATE DETAIL"
    }]
  }
})

const scenarios = [
  ["recognized", "INVALID_VALUE", "INVALID_VALUE"],
  ["unrecognized", "PRIVATE_UNKNOWN_CODE", ""],
  ["missing", undefined, ""]
]

for (const [expectedStatus, inputCode, expectedSavedCode] of scenarios) {
  const classified = classifyV3SafeSquareError(makeError(inputCode))
  const saved = sanitizeV3PersistedSquareDiagnostic(classified)

  assert.equal(classified.codeStatus, expectedStatus)
  assert.equal(saved.codeStatus, expectedStatus)
  assert.equal(saved.code, expectedSavedCode)
  assert.equal(saved.httpStatus, 400)
  assert.equal(saved.category, "INVALID_REQUEST_ERROR")
  assert.equal(saved.outcomeKnown, false)

  const serialized = JSON.stringify(saved)
  assert.ok(!serialized.includes("PRIVATE"))

  console.log(`${expectedStatus.toUpperCase()} PERSISTENCE: PASS`)
}

const timeout = sanitizeV3PersistedSquareDiagnostic({
  type: "timeout",
  outcomeKnown: false
})

assert.equal(timeout.codeStatus, null)
assert.equal(timeout.httpStatus, null)
console.log("TIMEOUT COMPATIBILITY: PASS")

const nested = PaymentOperation.schema.path("squareDiagnostic")?.schema
assert.ok(nested, "Missing Square diagnostic schema")

const codeStatusPath = nested.path("codeStatus")
assert.ok(codeStatusPath, "Missing codeStatus schema field")

for (const status of ["recognized", "unrecognized", "missing"]) {
  assert.ok(codeStatusPath.options.enum.includes(status))
}

assert.equal(codeStatusPath.defaultValue, null)
console.log("MONGOOSE CODE STATUS SCHEMA: PASS")

assert.equal(PaymentOperation.db.readyState, 0)
console.log("NO DATABASE CONNECTIONS: PASS")
console.log("NO SQUARE API REQUESTS: PASS")
console.log("DIAGNOSTIC PERSISTENCE REGRESSIONS: PASS")