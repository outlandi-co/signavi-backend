import assert from "node:assert/strict"
import { SquareError } from "square"
import {
  classifyV3SafeSquareError
} from "../utils/smartShippingV3SafeSquareError.js"

const classify = code => classifyV3SafeSquareError(
  new SquareError({
    statusCode: 400,
    message: "PRIVATE MESSAGE",
    body: {
      errors: [{
        category: "INVALID_REQUEST_ERROR",
        ...(code === undefined ? {} : { code }),
        detail: "PRIVATE DETAIL"
      }]
    }
  })
)

const known = classify("INVALID_VALUE")
assert.equal(known.codeStatus, "recognized")
assert.equal(known.code, "INVALID_VALUE")

const unknown = classify("UNRECOGNIZED_PRIVATE_CODE")
assert.equal(unknown.codeStatus, "unrecognized")
assert.equal(unknown.code, null)

const missing = classify(undefined)
assert.equal(missing.codeStatus, "missing")
assert.equal(missing.code, null)

for (const result of [known, unknown, missing]) {
  const output = JSON.stringify(result)

  assert.ok(!output.includes("PRIVATE MESSAGE"))
  assert.ok(!output.includes("PRIVATE DETAIL"))
  assert.ok(!output.includes("UNRECOGNIZED_PRIVATE_CODE"))
  assert.equal(result.outcomeKnown, false)
}

console.log("RECOGNIZED CODE STATUS: PASS")
console.log("UNRECOGNIZED CODE STATUS: PASS")
console.log("MISSING CODE STATUS: PASS")
console.log("RAW ERROR DATA EXCLUDED: PASS")
console.log("NO SQUARE API REQUESTS")
console.log("CODE STATUS REGRESSIONS: PASS")
