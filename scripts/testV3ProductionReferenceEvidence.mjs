import assert from "node:assert/strict"
import test from "node:test"

import {
  assessV3ProductionReferenceEvidence
} from "../utils/assessV3ProductionReferenceEvidence.js"

const id = "507f1f77bcf86cd799439011"

function assess(records) {
  return assessV3ProductionReferenceEvidence({
    orderId: id,
    records
  })
}

function assertBlocked(result) {
  assert.equal(result.blocked, true)
  assert.equal(result.verified, false)
  assert.equal(result.cleared, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(Object.isFrozen(result), true)
}

test("production reference is detected", () => {
  const result = assess([
    { referenceId: `SV3-${id}` }
  ])

  assert.equal(result.matchingRecordCount, 1)
  assert.equal(result.code, "EXISTING_V3_REFERENCE_FOUND")
  assertBlocked(result)
})

test("legacy reference formats are detected", () => {
  const result = assess([
    { referenceId: `signavi-v3-${id}` },
    { referenceId: `signavi-v3-sandbox-${id}` }
  ])

  assert.equal(result.matchingRecordCount, 2)
  assertBlocked(result)
})

test("empty evidence cannot authorize payment", () => {
  const result = assess([])

  assert.equal(result.code, "NO_REFERENCE_MATCH_NOT_CLEARANCE")
  assert.equal(result.matchingRecordCount, 0)
  assertBlocked(result)
})

test("unrelated references cannot authorize payment", () => {
  const result = assess([
    { referenceId: "UNRELATED_REFERENCE" }
  ])

  assert.equal(result.matchingRecordCount, 0)
  assertBlocked(result)
})

test("malformed evidence is conservatively blocked", () => {
  for (const records of [
    undefined,
    null,
    {},
    [null],
    [{}],
    [{ referenceId: 123 }]
  ]) {
    const result = assess(records)
    assertBlocked(result)
    assert.match(result.code, /INVALID|INCOMPLETE/)
  }
})

test("mixed evidence remains blocked and preserves match count", () => {
  const result = assess([
    { referenceId: `SV3-${id}` },
    {},
    { referenceId: "UNRELATED" }
  ])

  assert.equal(result.matchingRecordCount, 1)
  assert.equal(result.code, "PAYMENT_EVIDENCE_INCOMPLETE")
  assertBlocked(result)
})

test("invalid order identity is rejected", () => {
  assert.throws(
    () => assessV3ProductionReferenceEvidence({
      orderId: "invalid",
      records: []
    }),
    /INVALID_PRODUCTION_ORDER_ID/
  )
})

console.log("REFERENCE EVIDENCE TEST ONLY")
console.log("NO DATABASE OR SQUARE REQUESTS")