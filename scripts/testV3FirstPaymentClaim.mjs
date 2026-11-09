import test from "node:test"
import assert from "node:assert/strict"

import {
  evaluateV3FirstPaymentClaim
} from "../utils/evaluateV3FirstPaymentClaim.js"

const orderId = "abcdef123456abcdef123456"

const valid = () => ({
  orderId,
  environment: "production",
  firstAttempt: { eligible: true },
  knownHistory: { knownRecordsClear: true },
  reservation: {
    reserved: true,
    orderId,
    environment: "production",
    owner: "checkout:test-owner",
    idempotencyKey: `signavi-production-${orderId}`
  }
})

test("valid claim remains unauthorized for Square", () => {
  const result = evaluateV3FirstPaymentClaim(valid())

  assert.equal(result.eligibleForClaim, true)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
})

test("missing first attempt is rejected", () => {
  const input = valid()
  input.firstAttempt = { eligible: false }

  const result = evaluateV3FirstPaymentClaim(input)

  assert.equal(result.eligibleForClaim, false)
  assert.equal(result.reason, "FIRST_ATTEMPT_NOT_VERIFIED")
})

test("known payment history blocks claim", () => {
  const input = valid()
  input.knownHistory = { knownRecordsClear: false }

  const result = evaluateV3FirstPaymentClaim(input)

  assert.equal(result.reason, "KNOWN_HISTORY_NOT_CLEARED")
})

test("reservation owner is required", () => {
  const input = valid()
  input.reservation.owner = ""

  const result = evaluateV3FirstPaymentClaim(input)

  assert.equal(result.reason, "RESERVATION_OWNERSHIP_NOT_VERIFIED")
})

test("mismatched reservation identity is rejected", () => {
  const input = valid()
  input.reservation.orderId = "123456abcdef123456abcdef"

  const result = evaluateV3FirstPaymentClaim(input)

  assert.equal(result.reason, "RESERVATION_OWNERSHIP_NOT_VERIFIED")
})

test("non-production environment is rejected", () => {
  const input = valid()
  input.environment = "sandbox"

  const result = evaluateV3FirstPaymentClaim(input)

  assert.equal(result.reason, "PRODUCTION_ENVIRONMENT_REQUIRED")
})