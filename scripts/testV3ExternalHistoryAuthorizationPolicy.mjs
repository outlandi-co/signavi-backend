import test from "node:test"
import assert from "node:assert/strict"

import {
  probeV3ExternalPaymentHistory
} from "../utils/probeV3ExternalPaymentHistory.js"

const orderId = "abcdef123456abcdef123456"

const inspect = evidence =>
  probeV3ExternalPaymentHistory({
    orderId,
    lookup: async () => evidence
  })

test("empty history cannot authorize Square", async () => {
  const result = await inspect({
    complete: true,
    hasMore: false,
    existingPayment: false,
    existingLink: false
  })

  assert.equal(result.verified, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
})

test("browser-style verified flag cannot authorize Square", async () => {
  const result = await inspect({
    verified: true,
    complete: true,
    existingPayment: false,
    existingLink: false
  })

  assert.equal(result.verified, false)
  assert.equal(result.squareRequestAuthorized, false)
})

test("existing Square payment blocks authorization", async () => {
  const result = await inspect({
    complete: true,
    existingPayment: true
  })

  assert.equal(result.reason, "EXISTING_SQUARE_ACTIVITY")
  assert.equal(result.squareRequestAuthorized, false)
})

test("incomplete Square pagination blocks authorization", async () => {
  const result = await inspect({
    complete: false,
    hasMore: true
  })

  assert.equal(result.reason, "EXTERNAL_HISTORY_INCOMPLETE")
  assert.equal(result.squareRequestAuthorized, false)
})

test("Square history lookup failure blocks authorization", async () => {
  const result = await probeV3ExternalPaymentHistory({
    orderId,
    lookup: async () => {
      throw new Error("SIMULATED_SQUARE_TIMEOUT")
    }
  })

  assert.equal(result.reason, "EXTERNAL_HISTORY_LOOKUP_FAILED")
  assert.equal(result.squareRequestAuthorized, false)
})