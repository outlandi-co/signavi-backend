import test from "node:test"
import assert from "node:assert/strict"

import {
  evaluateV3FirstAttemptEligibility
} from "../utils/evaluateV3FirstAttemptEligibility.js"

const createdAt = new Date("2026-11-06T10:00:00.000Z")

const freshOrder = () => ({
  _id: "abcdef123456abcdef123456",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  createdAt,
  v3FirstAttemptProvenanceVersion: "storefront-v3-origin-v1",
  v3FirstAttemptProvenanceIssuedAt: createdAt,
  squareEnvironment: null,
  squarePaymentId: "",
  squareOrderId: "",
  squarePaymentLinkId: "",
  paymentUrl: "",
  squareExpectedAmountCents: null
})

test("valid provenance establishes candidacy, not payment authorization", () => {
  const result = evaluateV3FirstAttemptEligibility({
    order: freshOrder()
  })

  assert.equal(result.eligible, true)
  assert.equal(result.reason, "FIRST_ATTEMPT_CANDIDATE")
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
})

test("missing provenance blocks first attempt", () => {
  const order = freshOrder()

  delete order.v3FirstAttemptProvenanceVersion
  delete order.v3FirstAttemptProvenanceIssuedAt

  const result = evaluateV3FirstAttemptEligibility({ order })

  assert.equal(result.eligible, false)
  assert.equal(result.reason, "SERVER_PROVENANCE_NOT_ESTABLISHED")
})

test("late provenance cannot authorize checkout", () => {
  const order = freshOrder()

  order.v3FirstAttemptProvenanceIssuedAt =
    new Date(createdAt.getTime() + 120000)

  const result = evaluateV3FirstAttemptEligibility({ order })

  assert.equal(result.eligible, false)
  assert.equal(result.reason, "PROVENANCE_CREATION_TIME_MISMATCH")
})

test("existing Square payment identity blocks first attempt", () => {
  const order = freshOrder()

  order.squarePaymentLinkId = "existing_square_link"

  const result = evaluateV3FirstAttemptEligibility({ order })

  assert.equal(result.eligible, false)
  assert.equal(result.reason, "EXISTING_SQUARE_PAYMENT_IDENTITY")
})

test("paid orders are not first-attempt candidates", () => {
  const order = freshOrder()

  order.paymentStatus = "paid"

  const result = evaluateV3FirstAttemptEligibility({ order })

  assert.equal(result.eligible, false)
  assert.equal(result.reason, "ORDER_NOT_AWAITING_FIRST_PAYMENT")
})