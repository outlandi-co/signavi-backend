import assert from "node:assert/strict"
import test from "node:test"

import {
  assessV3TrustedCheckoutOrder
} from "../utils/assessV3TrustedCheckoutOrder.js"

const id = "6ae34a462c2d260840ced9bc"

const fresh = () => ({
  _id: id,
  status: "payment_required",
  paymentStatus: "pending",
  finalPrice: 27.50,
  paymentUrl: "",
  squarePaymentId: "",
  squareOrderId: "",
  squarePaymentLinkId: "",
  paymentUrlCreatedAt: null
})

test("fresh eligible order returns server-saved cents", () => {
  const result = assessV3TrustedCheckoutOrder(fresh())

  assert.equal(result.eligible, true)
  assert.equal(result.orderId, id)
  assert.equal(result.amountCents, 2750)
  assert.equal(result.squareRequestAuthorized, false)
})

test("paid and refunded orders are blocked", () => {
  for (const paymentStatus of ["paid", "refunded"]) {
    const order = fresh()
    order.paymentStatus = paymentStatus

    assert.equal(
      assessV3TrustedCheckoutOrder(order).eligible,
      false
    )
  }
})

test("order must be payment-ready", () => {
  const order = fresh()
  order.status = "production"

  assert.equal(
    assessV3TrustedCheckoutOrder(order).eligible,
    false
  )
})

test("legacy Square evidence blocks new payment creation", () => {
  const fields = {
    paymentUrl: "https://square.link/u/existing",
    squarePaymentId: "PAYMENT_123",
    squareOrderId: "SQUARE_ORDER_123",
    squarePaymentLinkId: "LINK_123",
    paymentUrlCreatedAt: new Date()
  }

  for (const [field, value] of Object.entries(fields)) {
    const order = fresh()
    order[field] = value

    const result = assessV3TrustedCheckoutOrder(order)

    assert.equal(result.eligible, false, field)
    assert.equal(result.reason, "EXISTING_PAYMENT_EVIDENCE")
  }
})

test("invalid or fractional-cent totals are blocked", () => {
  for (const value of [0, -5, NaN, Infinity, "27.50", 2.505]) {
    const order = fresh()
    order.finalPrice = value

    assert.equal(
      assessV3TrustedCheckoutOrder(order).eligible,
      false,
      String(value)
    )
  }
})

test("unknown payment status fails closed", () => {
  const order = fresh()
  order.paymentStatus = "unknown"

  assert.equal(
    assessV3TrustedCheckoutOrder(order).eligible,
    false
  )
})

test("missing order fails closed", () => {
  assert.equal(
    assessV3TrustedCheckoutOrder(null).eligible,
    false
  )
})