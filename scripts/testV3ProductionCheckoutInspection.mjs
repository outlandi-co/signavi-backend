import test from "node:test"
import assert from "node:assert/strict"

import {
  inspectV3ProductionCheckout
} from "../utils/inspectV3ProductionCheckout.js"

const orderId = "507f1f77bcf86cd799439011"

const eligibleOrder = () => ({
  _id: orderId,
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  finalPrice: 27.50,
  paymentUrl: "",
  squarePaymentId: "",
  squareOrderId: "",
  squarePaymentLinkId: "",
  paymentUrlCreatedAt: null
})

const blockedHistory = async () => ({
  knownRecordsClear: true,
  verified: false,
  noPriorPaymentActivity: false
})

test("missing dependencies fail closed", async () => {
  const result = await inspectV3ProductionCheckout({
    order: eligibleOrder()
  })

  assert.equal(result.httpStatus, 503)
  assert.equal(result.squareRequestAuthorized, false)
})

test("unauthorized caller cannot inspect history", async () => {
  let historyCalls = 0

  const result = await inspectV3ProductionCheckout({
    order: eligibleOrder(),
    authorizeRequest: async () => false,
    checkHistoricalPayment: async () => {
      historyCalls++
      return blockedHistory()
    }
  })

  assert.equal(result.httpStatus, 403)
  assert.equal(historyCalls, 0)
})

test("invalid payable order is rejected before history", async () => {
  let historyCalls = 0

  const order = eligibleOrder()
  order.finalPrice = 0

  const result = await inspectV3ProductionCheckout({
    order,
    authorizeRequest: async () => true,
    checkHistoricalPayment: async () => {
      historyCalls++
      return blockedHistory()
    }
  })

  assert.equal(result.httpStatus, 409)
  assert.equal(historyCalls, 0)
})

test("unverified history blocks checkout", async () => {
  const result = await inspectV3ProductionCheckout({
    order: eligibleOrder(),
    authorizeRequest: async () => true,
    checkHistoricalPayment: blockedHistory
  })

  assert.equal(result.httpStatus, 423)
  assert.equal(result.reason, "HISTORICAL_PAYMENT_NOT_CLEARED")
})

test("historical check exceptions fail closed", async () => {
  const result = await inspectV3ProductionCheckout({
    order: eligibleOrder(),
    authorizeRequest: async () => true,
    checkHistoricalPayment: async () => {
      throw new Error("DATABASE_UNAVAILABLE")
    }
  })

  assert.equal(result.httpStatus, 423)
  assert.equal(result.squareRequestAuthorized, false)
})

test("even simulated clearance never activates Square", async () => {
  let observed

  const result = await inspectV3ProductionCheckout({
    order: eligibleOrder(),
    authorizeRequest: async () => true,
    checkHistoricalPayment: async input => {
      observed = input
      return {
        verified: true,
        noPriorPaymentActivity: true
      }
    }
  })

  assert.equal(observed.orderId, orderId)
  assert.equal(observed.amountCents, 2750)
  assert.equal(result.httpStatus, 423)
  assert.equal(
    result.reason,
    "V3_PRODUCTION_EXECUTION_NOT_ACTIVATED"
  )
  assert.equal(result.paymentCreated, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
})