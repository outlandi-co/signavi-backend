import assert from "node:assert/strict"
import test from "node:test"

import {
  probeV3ExternalPaymentHistory
} from "../utils/probeV3ExternalPaymentHistory.js"

const ID = "507f1f77bcf86cd799439011"

async function check(input, reason) {
  const result = await probeV3ExternalPaymentHistory(input)

  assert.equal(result.reason, reason)
  assert.equal(result.httpStatus, 423)
  assert.equal(result.verified, false)
  assert.equal(result.noPriorPaymentActivity, false)
  assert.equal(result.readyForTrustedInitialization, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(Object.isFrozen(result), true)
}

test("invalid identity never calls lookup", async () => {
  let calls = 0

  await check({
    orderId: "invalid",
    lookup: async () => {
      calls++
      return {}
    }
  }, "INVALID_ORDER_ID")

  assert.equal(calls, 0)
})

test("missing trusted lookup blocks", async () => {
  await check({
    orderId: ID
  }, "TRUSTED_LOOKUP_MISSING")
})

test("lookup failure blocks", async () => {
  await check({
    orderId: ID,
    lookup: async () => {
      throw new Error("synthetic SDK failure")
    }
  }, "EXTERNAL_HISTORY_LOOKUP_FAILED")
})

test("invalid response blocks", async () => {
  await check({
    orderId: ID,
    lookup: async () => null
  }, "EXTERNAL_HISTORY_RESPONSE_INVALID")
})

test("existing payment blocks", async () => {
  await check({
    orderId: ID,
    lookup: async () => ({ existingPayment: true })
  }, "EXISTING_SQUARE_ACTIVITY")
})

test("existing payment link blocks", async () => {
  await check({
    orderId: ID,
    lookup: async () => ({ existingLink: true })
  }, "EXISTING_SQUARE_ACTIVITY")
})

test("identity conflict blocks", async () => {
  await check({
    orderId: ID,
    lookup: async () => ({ identityMismatch: true })
  }, "EXTERNAL_HISTORY_CONFLICT")
})

test("incomplete pagination blocks", async () => {
  await check({
    orderId: ID,
    lookup: async () => ({
      hasMore: true,
      complete: false
    })
  }, "EXTERNAL_HISTORY_INCOMPLETE")
})

test("timeout evidence blocks", async () => {
  await check({
    orderId: ID,
    lookup: async () => ({ timedOut: true })
  }, "EXTERNAL_HISTORY_INCOMPLETE")
})

test("empty lookup cannot authorize checkout", async () => {
  await check({
    orderId: ID,
    lookup: async () => ({})
  }, "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED")
})

test("claimed clearance cannot authorize checkout", async () => {
  await check({
    orderId: ID,
    lookup: async () => ({
      verified: true,
      noPriorPaymentActivity: true,
      complete: true,
      squareRequestAuthorized: true
    })
  }, "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED")
})

test("lookup receives only server-bound order identity", async () => {
  let received

  await check({
    orderId: ID,
    token: "untrusted-token",
    squareClient: { payments: {} },
    lookup: async request => {
      received = request
      return {}
    }
  }, "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED")

  assert.deepEqual(received, { orderId: ID })
  assert.equal(Object.isFrozen(received), true)
})

console.log("TEST-ONLY EXTERNAL HISTORY PROBE")