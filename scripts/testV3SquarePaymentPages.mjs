import assert from "node:assert/strict"
import test from "node:test"

import {
  inspectV3SquarePaymentPages
} from "../utils/inspectV3SquarePaymentPages.js"

const base = {
  orderId: "internal-order-123",
  referenceId: "signavi-order-123",
  locationId: "TEST-LOCATION",
  beginTime: "2025-01-01T00:00:00Z",
  endTime: "2026-10-30T00:00:00Z"
}

function blocked(result) {
  assert.equal(result.verified, false)
  assert.equal(result.cleared, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.noPriorPaymentActivity, false)
  assert.equal(Object.isFrozen(result), true)
}

test("missing trusted input never calls lookup", async () => {
  let calls = 0
  const result = await inspectV3SquarePaymentPages({
    ...base,
    locationId: "",
    listPage: async () => {
      calls++
      return { payments: [] }
    }
  })

  blocked(result)
  assert.equal(calls, 0)
  assert.equal(result.reason, "INVALID_TRUSTED_SEARCH_INPUT")
})

test("empty final page does not grant clearance", async () => {
  const result = await inspectV3SquarePaymentPages({
    ...base,
    listPage: async () => ({
      payments: [],
      cursor: null
    })
  })

  blocked(result)
  assert.equal(
    result.reason,
    "SEARCH_COMPLETED_WITHOUT_CLEARANCE"
  )
  assert.equal(result.historyListingCompleted, true)
})

test("matching payment blocks", async () => {
  const result = await inspectV3SquarePaymentPages({
    ...base,
    listPage: async () => ({
      payments: [{
        id: "payment-test-1",
        referenceId: base.referenceId
      }],
      cursor: null
    })
  })

  blocked(result)
  assert.equal(result.existingPayment, true)
})

test("pagination searches subsequent pages", async () => {
  const requests = []

  const result = await inspectV3SquarePaymentPages({
    ...base,
    listPage: async request => {
      requests.push(request)

      if (!request.cursor) {
        return {
          payments: [{ id: "unrelated" }],
          cursor: "page-two"
        }
      }

      return {
        payments: [{
          id: "matching-payment",
          orderId: base.orderId
        }],
        cursor: null
      }
    }
  })

  blocked(result)
  assert.equal(requests.length, 2)
  assert.equal(requests[1].cursor, "page-two")
  assert.equal(result.existingPayment, true)
})

test("repeated pagination cursor blocks", async () => {
  const result = await inspectV3SquarePaymentPages({
    ...base,
    listPage: async () => ({
      payments: [],
      cursor: "same-cursor"
    })
  })

  blocked(result)
  assert.equal(result.reason, "REPEATED_SQUARE_CURSOR")
})

test("Square API failure blocks", async () => {
  const result = await inspectV3SquarePaymentPages({
    ...base,
    listPage: async () => {
      throw new Error("synthetic network failure")
    }
  })

  blocked(result)
  assert.equal(result.reason, "SQUARE_LIST_FAILED")
})

console.log("TEST ONLY: NO SQUARE CLIENT, DB OR HTTP")