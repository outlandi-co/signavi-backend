import test from "node:test"
import assert from "node:assert/strict"

import {
  createV3ProductionCheckoutActivationCoordinator
} from "../utils/coordinateV3ProductionCheckoutActivation.js"

const makeDeps = overrides => ({
  Order: { findById() {} },
  Reservation: { create() {} },
  PaymentOperation: { create() {} },
  startSession() {},
  checkHistoricalPayment: async () => {
    throw new Error("Unexpected history query")
  },
  ...overrides
})

test("missing dependencies block checkout", async () => {
  const coordinate =
    createV3ProductionCheckoutActivationCoordinator()

  const result = await coordinate({})

  assert.equal(result.ready, false)
  assert.equal(result.httpStatus, 423)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
})

test("invalid order identity blocks before history", async () => {
  let historyCalls = 0

  const coordinate =
    createV3ProductionCheckoutActivationCoordinator(
      makeDeps({
        checkHistoricalPayment: async () => {
          historyCalls++
          throw new Error("Should not be called")
        }
      })
    )

  const result = await coordinate({
    order: { _id: "invalid" },
    guestToken: "test",
    signedQuote: {}
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, "INVALID_ORDER_ID")
  assert.equal(historyCalls, 0)
})

test("missing signed quote cannot reach history", async () => {
  let historyCalls = 0

  const coordinate =
    createV3ProductionCheckoutActivationCoordinator(
      makeDeps({
        checkHistoricalPayment: async () => {
          historyCalls++
          return {
            verified: true,
            noPriorPaymentActivity: true
          }
        }
      })
    )

  const result = await coordinate({
    order: {
      _id: "507f1f77bcf86cd799439011",
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid"
    },
    guestToken: "invalid-token",
    signedQuote: null
  })

  assert.equal(result.ready, false)
  assert.equal(
    result.reason,
    "SIGNED_CHECKOUT_NOT_VERIFIED"
  )
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(historyCalls, 0)
})
test("unverified history blocks payment initialization", async () => {
  let historyCalls = 0

  const coordinate = createV3ProductionCheckoutActivationCoordinator(
    makeDeps({
      checkHistoricalPayment: async () => {
        historyCalls++
        return {
          verified: false,
          noPriorPaymentActivity: false,
          reason: "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED"
        }
      }
    })
  )

  const result = await coordinate({
    order: {
      _id: "507f1f77bcf86cd799439011",
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid"
    },
    guestToken: "invalid-token",
    signedQuote: null
  })

  assert.equal(result.ready, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(historyCalls, 0)
})

test("throwing payment history dependency stays fail closed", async () => {
  let historyCalls = 0

  const coordinate = createV3ProductionCheckoutActivationCoordinator(
    makeDeps({
      checkHistoricalPayment: async () => {
        historyCalls++
        throw new Error("Square history unavailable")
      }
    })
  )

  const result = await coordinate({
    order: { _id: "507f1f77bcf86cd799439011" },
    guestToken: "invalid-token",
    signedQuote: null
  })

  assert.equal(result.ready, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(historyCalls, 0)
})

test("missing history verifier blocks before checkout", async () => {
  const coordinate = createV3ProductionCheckoutActivationCoordinator(
    makeDeps({ checkHistoricalPayment: undefined })
  )

  const result = await coordinate({
    order: { _id: "507f1f77bcf86cd799439011" },
    guestToken: "invalid-token",
    signedQuote: null
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, "TRUSTED_DEPENDENCIES_REQUIRED")
  assert.equal(result.squareRequestAuthorized, false)
})