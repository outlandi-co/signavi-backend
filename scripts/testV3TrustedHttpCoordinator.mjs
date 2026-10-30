import test from "node:test"
import assert from "node:assert/strict"

import {
  createV3TrustedHttpCheckoutCoordinator
} from "../utils/coordinateV3TrustedHttpCheckout.js"

const ORDER_ID = "507f1f77bcf86cd799439011"

const validOrder = () => ({
  _id: ORDER_ID,
  source: "store",
  status: "payment_required",
  paymentStatus: "pending",
  finalPrice: 49.95,
  paymentUrl: "",
  squarePaymentId: "",
  squareOrderId: "",
  squarePaymentLinkId: ""
})

function dependencies({
  authorized = true,
  historical = {
    verified: false,
    noPriorPaymentActivity: false
  }
} = {}) {
  const calls = {
    authorization: 0,
    history: 0,
    initialization: 0
  }

  const coordinate = createV3TrustedHttpCheckoutCoordinator({
    Reservation: {
      create: async () => {
        calls.initialization++
        throw new Error("Unexpected database write")
      },
      findOne: () => ({
        lean: async () => null
      })
    },
    PaymentOperation: {
      create: async () => {
        calls.initialization++
        throw new Error("Unexpected database write")
      },
      findOne: () => ({
        lean: async () => null
      })
    },
    startSession: async () => {
      calls.initialization++
      throw new Error("Unexpected transaction")
    },
    authorizeRequest: async () => {
      calls.authorization++
      return authorized
    },
    checkHistoricalPayment: async identity => {
      calls.history++
      assert.equal(identity.orderId, ORDER_ID)
      assert.equal(identity.amountCents, 4995)
      return historical
    }
  })

  return { coordinate, calls }
}

test("Missing trusted dependencies block checkout", async () => {
  const coordinate = createV3TrustedHttpCheckoutCoordinator()
  const result = await coordinate({ order: validOrder() })

  assert.equal(result.ready, false)
  assert.equal(result.httpStatus, 503)
  assert.equal(result.squareRequestAuthorized, false)
})

test("Unauthorized requests never reach payment history", async () => {
  const { coordinate, calls } = dependencies({
    authorized: false
  })

  const result = await coordinate({
    order: validOrder()
  })

  assert.equal(result.ready, false)
  assert.equal(result.httpStatus, 403)
  assert.equal(calls.authorization, 1)
  assert.equal(calls.history, 0)
  assert.equal(calls.initialization, 0)
})

test("Unverified history blocks atomic initialization", async () => {
  const { coordinate, calls } = dependencies()

  const result = await coordinate({
    order: validOrder()
  })

  assert.equal(result.ready, false)
  assert.equal(result.reason, "HISTORICAL_PAYMENT_NOT_CLEARED")
  assert.equal(result.httpStatus, 423)
  assert.equal(result.squareRequestAuthorized, false)

  assert.equal(calls.authorization, 1)
  assert.equal(calls.history, 1)
  assert.equal(calls.initialization, 0)
})

test("Existing payment activity blocks initialization", async () => {
  const { coordinate, calls } = dependencies({
    historical: {
      verified: false,
      noPriorPaymentActivity: false,
      reason: "EXISTING_PAYMENT_HISTORY_REQUIRES_RECONCILIATION"
    }
  })

  const result = await coordinate({
    order: validOrder()
  })

  assert.equal(result.ready, false)
  assert.equal(result.httpStatus, 423)
  assert.equal(calls.history, 1)
  assert.equal(calls.initialization, 0)
})

test("Existing order payment URL blocks before history check", async () => {
  const { coordinate, calls } = dependencies()

  const order = validOrder()
  order.paymentUrl = "https://example.invalid/existing-payment"

  const result = await coordinate({ order })

  assert.equal(result.ready, false)
  assert.equal(result.reason, "EXISTING_PAYMENT_EVIDENCE")
  assert.equal(calls.history, 0)
  assert.equal(calls.initialization, 0)
})

test("Invalid server-saved total blocks checkout", async () => {
  const { coordinate, calls } = dependencies()

  const order = validOrder()
  order.finalPrice = 49.999

  const result = await coordinate({ order })

  assert.equal(result.ready, false)
  assert.equal(result.reason, "INVALID_PAYMENT_CENTS")
  assert.equal(calls.history, 0)
  assert.equal(calls.initialization, 0)
})