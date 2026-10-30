import test from "node:test"
import assert from "node:assert/strict"

import {
  verifyV3TrustedCheckoutAmount
} from "../utils/verifyV3TrustedCheckoutAmount.js"

const ORDER_ID = "507f1f77bcf86cd799439011"

const prepared = () => ({
  orderId: ORDER_ID,
  subtotalCents: 4000,
  taxCents: 330,
  shippingAmountCents: 665,
  totalCents: 4995
})

const order = () => ({
  _id: ORDER_ID,
  subtotal: 40,
  tax: 3.30,
  shipping: 6.65,
  shippingCost: 6.65,
  shippingTotal: 6.65,
  deliveryFee: 6.65,
  finalPrice: 49.95
})

test("Valid saved total matches prepared checkout", () => {
  const result = verifyV3TrustedCheckoutAmount({
    order: order(),
    prepared: prepared()
  })

  assert.equal(result.verified, true)
  assert.equal(result.amountCents, 4995)
  assert.equal(result.squareRequestAuthorized, false)
})

test("Modified saved shipping amount is rejected", () => {
  const candidate = order()
  candidate.shipping = 9.65

  const result = verifyV3TrustedCheckoutAmount({
    order: candidate,
    prepared: prepared()
  })

  assert.equal(result.verified, false)
  assert.equal(result.reason, "CHECKOUT_AMOUNT_MISMATCH")
})

test("Every duplicate shipping field must match", () => {
  for (const field of [
    "shippingCost",
    "shippingTotal",
    "deliveryFee"
  ]) {
    const candidate = order()
    candidate[field] = 7.65

    const result = verifyV3TrustedCheckoutAmount({
      order: candidate,
      prepared: prepared()
    })

    assert.equal(result.verified, false, field)
    assert.equal(result.reason, "SHIPPING_FIELD_MISMATCH")
    assert.equal(result.squareRequestAuthorized, false)
  }
})

test("Missing duplicate shipping fields are rejected", () => {
  for (const field of [
    "shippingCost",
    "shippingTotal",
    "deliveryFee"
  ]) {
    const candidate = order()
    delete candidate[field]

    const result = verifyV3TrustedCheckoutAmount({
      order: candidate,
      prepared: prepared()
    })

    assert.equal(result.verified, false, field)
  }
})
test("Modified prepared total is rejected", () => {
  const candidate = prepared()
  candidate.totalCents = 5995

  const result = verifyV3TrustedCheckoutAmount({
    order: order(),
    prepared: candidate
  })

  assert.equal(result.verified, false)
})

test("Mismatched order identity is rejected", () => {
  const candidate = prepared()
  candidate.orderId = "507f1f77bcf86cd799439012"

  const result = verifyV3TrustedCheckoutAmount({
    order: order(),
    prepared: candidate
  })

  assert.equal(result.verified, false)
  assert.equal(result.reason, "ORDER_IDENTITY_MISMATCH")
})

test("Fractional cent values are rejected", () => {
  const candidate = order()
  candidate.finalPrice = 49.951

  const result = verifyV3TrustedCheckoutAmount({
    order: candidate,
    prepared: prepared()
  })

  assert.equal(result.verified, false)
})

test("Prepared total arithmetic inconsistency is rejected", () => {
  const candidate = prepared()
  candidate.taxCents = 331

  const result = verifyV3TrustedCheckoutAmount({
    order: order(),
    prepared: candidate
  })

  assert.equal(result.verified, false)
})

test("Missing or nonnumeric saved totals are rejected", () => {
  for (const value of [null, undefined, "49.95", NaN]) {
    const candidate = order()
    candidate.finalPrice = value

    const result = verifyV3TrustedCheckoutAmount({
      order: candidate,
      prepared: prepared()
    })

    assert.equal(result.verified, false)
  }
})