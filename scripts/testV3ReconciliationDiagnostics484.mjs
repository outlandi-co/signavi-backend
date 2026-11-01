import assert from "node:assert/strict"
import test from "node:test"

import {
  inspectV3SquarePaymentPages
} from "../utils/inspectV3SquarePaymentPages.js"

import {
  assessV3ExternalReconciliation
} from "../utils/assessV3ExternalReconciliation.js"

import {
  summarizeV3ReconciliationEvidence
} from "../utils/summarizeV3ReconciliationEvidence.js"

const identity = {
  orderId: "507f1f77bcf86cd799439011",
  referenceId: "signavi-484-test",
  locationId: "TEST_LOCATION",
  beginTime: "2020-01-01T00:00:00.000Z",
  endTime: "2020-01-02T00:00:00.000Z"
}

async function diagnose(listPage, maxPages = 10) {
  const inspectorEvidence =
    await inspectV3SquarePaymentPages({
      ...identity,
      listPage,
      maxPages
    })

  const reconciliationOutcome =
    assessV3ExternalReconciliation({
      orderId: identity.orderId,
      knownHistory: { knownRecordsClear: true },
      squareEvidence: inspectorEvidence
    })

  return summarizeV3ReconciliationEvidence({
    inspectorEvidence,
    reconciliationOutcome
  })
}

function blocked(result, reason, category) {
  assert.equal(result.status, "reconciliation_required")
  assert.equal(result.httpStatus, 423)
  assert.equal(result.sourceReason, reason)
  assert.equal(result.category, category)
  assert.equal(result.verified, false)
  assert.equal(result.noPriorPaymentActivity, false)
  assert.equal(result.cleared, false)
  assert.equal(result.readyForTrustedInitialization, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.paymentCreated, false)
  assert.equal(Object.isFrozen(result), true)
}

test("matching payment preserves exact diagnostic", async () => {
  const result = await diagnose(async () => ({
    payments: [{ referenceId: identity.referenceId }],
    cursor: null
  }))

  blocked(
    result,
    "MATCHING_SQUARE_PAYMENT_FOUND",
    "existing_payment"
  )
  assert.equal(result.existingPayment, true)
  assert.equal(result.paymentsScanned, 1)
})

test("empty completed scan remains unverified", async () => {
  const result = await diagnose(async () => ({
    payments: [],
    cursor: null
  }))

  blocked(
    result,
    "SEARCH_COMPLETED_WITHOUT_CLEARANCE",
    "history_not_verified"
  )
  assert.equal(result.historyListingCompleted, true)
})

test("repeated cursor is distinguishable", async () => {
  const result = await diagnose(async () => ({
    payments: [],
    cursor: "repeat"
  }))

  blocked(
    result,
    "REPEATED_SQUARE_CURSOR",
    "pagination_uncertain"
  )
})

test("Square lookup failure is distinguishable", async () => {
  const result = await diagnose(async () => {
    throw new Error("synthetic error")
  })

  blocked(
    result,
    "SQUARE_LIST_FAILED",
    "external_lookup_failed"
  )
})

test("page cap is distinguishable", async () => {
  const result = await diagnose(
    async () => ({ payments: [], cursor: "more" }),
    1
  )

  blocked(
    result,
    "SQUARE_PAGE_LIMIT_REACHED",
    "pagination_incomplete"
  )
})

test("fabricated authorization cannot change outcome", () => {
  const result = summarizeV3ReconciliationEvidence({
    inspectorEvidence: {
      reason: "SEARCH_COMPLETED_WITHOUT_CLEARANCE",
      verified: true,
      cleared: true,
      squareRequestAuthorized: true,
      retryAuthorized: true
    },
    reconciliationOutcome: {
      cleared: true,
      squareRequestAuthorized: true
    }
  })

  blocked(
    result,
    "SEARCH_COMPLETED_WITHOUT_CLEARANCE",
    "history_not_verified"
  )
})

test("unrecognized reason is normalized and blocked", () => {
  const result = summarizeV3ReconciliationEvidence({
    inspectorEvidence: {
      reason: "AUTHORIZE_PAYMENT",
      paymentsScanned: -12
    }
  })

  blocked(
    result,
    "UNVERIFIED_EXTERNAL_EVIDENCE",
    "unknown_evidence"
  )
  assert.equal(result.paymentsScanned, null)
})

console.log("STEP 484: ISOLATED DIAGNOSTICS ONLY")