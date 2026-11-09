import test from "node:test"
import assert from "node:assert/strict"

import {
  evaluateV3ProductionFirstPaymentAuthorization
} from "../utils/evaluateV3ProductionFirstPaymentAuthorization.js"

const orderId = "abcdef123456abcdef123456"

const valid = () => ({
  orderId,
  eligibility: { eligible: true },
  knownHistory: { knownRecordsClear: true },
  externalHistory: {
    complete: true,
    authoritativeNoPriorActivity: true,
    existingPayment: false,
    existingLink: false
  },
  sharedFence: {
    reserved: true,
    orderId,
    environment: "production",
    idempotencyKey: `signavi-production-${orderId}`
  }
})

test("missing eligibility blocks authorization", () => {
  const input = valid()
  input.eligibility = { eligible: false }

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.authorized, false)
  assert.equal(result.reason, "FIRST_ATTEMPT_NOT_ELIGIBLE")
})

test("known payment history must be clear", () => {
  const input = valid()
  input.knownHistory = { knownRecordsClear: false }

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.reason, "KNOWN_PAYMENT_HISTORY_NOT_CLEARED")
})

test("existing Square activity blocks authorization", () => {
  const input = valid()
  input.externalHistory.existingPayment = true

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.reason, "EXTERNAL_PAYMENT_ACTIVITY_DETECTED")
})

test("incomplete external history blocks authorization", () => {
  const input = valid()
  input.externalHistory.complete = false

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.reason, "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED")
})

test("shared fence identity must match", () => {
  const input = valid()
  input.sharedFence.idempotencyKey = "wrong-key"

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.reason, "SHARED_FENCE_NOT_VERIFIED")
})

test("even favorable inputs cannot independently authorize Square", () => {
  const result =
    evaluateV3ProductionFirstPaymentAuthorization(valid())

  assert.equal(result.authorized, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(
    result.reason,
    "TRUSTED_EXECUTION_AUTHORIZATION_NOT_IMPLEMENTED"
  )
})
test("fabricated clearance cannot authorize a Square request", () => {
  const input = valid()

  input.externalHistory = {
    complete: true,
    authoritativeNoPriorActivity: true,
    verified: true,
    noPriorPaymentActivity: true
  }

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.authorized, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
})

test("mismatched shared fence order is rejected", () => {
  const input = valid()

  input.sharedFence.orderId = "123456abcdef123456abcdef"

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.authorized, false)
  assert.equal(result.reason, "SHARED_FENCE_NOT_VERIFIED")
})

test("missing external evidence is rejected", () => {
  const input = valid()

  delete input.externalHistory

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.authorized, false)
  assert.equal(
    result.reason,
    "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED"
  )
})

test("Square identity conflict blocks authorization", () => {
  const input = valid()

  input.externalHistory.identityMismatch = true

  const result =
    evaluateV3ProductionFirstPaymentAuthorization(input)

  assert.equal(result.reason, "EXTERNAL_PAYMENT_ACTIVITY_DETECTED")
  assert.equal(result.squareRequestAuthorized, false)
})