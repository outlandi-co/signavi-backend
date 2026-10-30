import assert from "node:assert/strict"
import test from "node:test"

import {
  checkV3KnownPaymentHistory
} from "../utils/checkV3KnownPaymentHistory.js"

const id = "6ae34a462c2d260840ced9bc"

function repo(result = null, shouldThrow = false) {
  return {
    findOne(filter) {
      return {
        async lean() {
          if (shouldThrow) throw new Error("SIMULATED_DB_FAILURE")
          return typeof result === "function"
            ? result(filter)
            : result
        }
      }
    }
  }
}

const freshOrder = () => ({
  _id: id,
  paymentStatus: "unpaid",
  paymentUrl: "",
  squarePaymentId: "",
  squareOrderId: "",
  squarePaymentLinkId: "",
  paymentUrlCreatedAt: null
})

function setup(overrides = {}) {
  return {
    orderId: id,
    Order: repo(freshOrder()),
    SquareReservation: repo(),
    SharedPaymentReservation: repo(),
    ProductionReservation: repo(),
    PaymentOperation: repo(),
    ...overrides
  }
}

test("missing records never automatically authorize Square", async () => {
  const result = await checkV3KnownPaymentHistory(setup())

  assert.equal(result.knownRecordsClear, true)
  assert.equal(result.verified, false)
  assert.equal(result.noPriorPaymentActivity, false)
  assert.equal(result.reason, "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED")
})

test("legacy Square reservation blocks clearance", async () => {
  const result = await checkV3KnownPaymentHistory(
    setup({
      SquareReservation: repo({ status: "reconciliation_required" })
    })
  )

  assert.equal(result.knownRecordsClear, false)
  assert.equal(
    result.source,
    "SquarePaymentCreationReservation"
  )
})

test("shared payment reservation blocks clearance", async () => {
  const result = await checkV3KnownPaymentHistory(
    setup({
      SharedPaymentReservation: repo({ status: "claimed" })
    })
  )

  assert.equal(result.verified, false)
  assert.equal(result.source, "SharedSquarePaymentReservation")
})

test("production purchase reservation blocks clearance", async () => {
  const result = await checkV3KnownPaymentHistory(
    setup({
      ProductionReservation: repo({ status: "claim_pending" })
    })
  )

  assert.equal(result.verified, false)
  assert.equal(
    result.source,
    "SmartShippingV3ProductionPurchaseReservation"
  )
})

test("existing payment operation blocks clearance", async () => {
  const result = await checkV3KnownPaymentHistory(
    setup({
      PaymentOperation: repo({ status: "pending" })
    })
  )

  assert.equal(result.verified, false)
  assert.equal(result.source, "SmartShippingV3PaymentOperation")
})

test("order payment evidence blocks clearance", async () => {
  const order = freshOrder()
  order.squarePaymentId = "PREVIOUS_PAYMENT"

  const result = await checkV3KnownPaymentHistory(
    setup({ Order: repo(order) })
  )

  assert.equal(result.verified, false)
  assert.equal(result.source, "Order")
})

test("database read failures fail closed", async () => {
  const result = await checkV3KnownPaymentHistory(
    setup({ SquareReservation: repo(null, true) })
  )

  assert.equal(result.verified, false)
  assert.equal(result.reason, "PAYMENT_HISTORY_READ_UNCERTAIN")
})

test("missing repository blocks clearance", async () => {
  const result = await checkV3KnownPaymentHistory(
    setup({ PaymentOperation: null })
  )

  assert.equal(result.verified, false)
  assert.equal(
    result.reason,
    "PAYMENT_HISTORY_REPOSITORY_MISSING"
  )
})

test("invalid order ID blocks clearance", async () => {
  const result = await checkV3KnownPaymentHistory(
    setup({ orderId: "invalid" })
  )

  assert.equal(result.verified, false)
  assert.equal(result.reason, "INVALID_ORDER_ID")
})