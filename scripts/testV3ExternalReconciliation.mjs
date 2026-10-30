import assert from "node:assert/strict"
import test from "node:test"

import {
  assessV3ExternalReconciliation
} from "../utils/assessV3ExternalReconciliation.js"

const ID = "507f1f77bcf86cd799439011"

function check(input, expectedReason) {
  const outcome = assessV3ExternalReconciliation(input)

  assert.equal(outcome.reason, expectedReason)
  assert.equal(outcome.httpStatus, 423)
  assert.equal(outcome.cleared, false)
  assert.equal(outcome.readyForTrustedInitialization, false)
  assert.equal(outcome.squareRequestAuthorized, false)
  assert.equal(outcome.retryAuthorized, false)
  assert.equal(Object.isFrozen(outcome), true)
}

const clearKnown = {
  knownRecordsClear: true,
  verified: false,
  noPriorPaymentActivity: false
}

test("missing history blocks checkout", () => {
  check(
    { orderId: ID },
    "KNOWN_PAYMENT_HISTORY_NOT_CLEARED"
  )
})

test("invalid order identity blocks checkout", () => {
  check(
    { orderId: "invalid", knownHistory: clearKnown },
    "INVALID_ORDER_ID"
  )
})

test("known historical activity blocks checkout", () => {
  check(
    {
      orderId: ID,
      knownHistory: {
        knownRecordsClear: false,
        source: "PaymentOperation"
      }
    },
    "KNOWN_PAYMENT_HISTORY_NOT_CLEARED"
  )
})

test("existing Square payment requires reconciliation", () => {
  check(
    {
      orderId: ID,
      knownHistory: clearKnown,
      squareEvidence: { existingPayment: true }
    },
    "EXISTING_SQUARE_ACTIVITY_REQUIRES_RECONCILIATION"
  )
})

test("existing Square link requires reconciliation", () => {
  check(
    {
      orderId: ID,
      knownHistory: clearKnown,
      squareEvidence: { existingLink: true }
    },
    "EXISTING_SQUARE_ACTIVITY_REQUIRES_RECONCILIATION"
  )
})

test("conflicting Square identity blocks checkout", () => {
  check(
    {
      orderId: ID,
      knownHistory: clearKnown,
      squareEvidence: { identityMismatch: true }
    },
    "SQUARE_EVIDENCE_CONFLICT"
  )
})

test("missing Square evidence cannot clear checkout", () => {
  check(
    { orderId: ID, knownHistory: clearKnown },
    "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED"
  )
})

test("empty Square lookup cannot clear checkout", () => {
  check(
    {
      orderId: ID,
      knownHistory: clearKnown,
      squareEvidence: {}
    },
    "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED"
  )
})

test("caller-supplied clearance cannot activate checkout", () => {
  check(
    {
      orderId: ID,
      knownHistory: clearKnown,
      squareEvidence: {
        verified: true,
        noPriorPaymentActivity: true,
        clear: true,
        squareRequestAuthorized: true
      }
    },
    "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED"
  )
})

console.log("TEST ONLY: EXTERNAL RECONCILIATION FAILS CLOSED")