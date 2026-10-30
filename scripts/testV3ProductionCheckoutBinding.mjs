import test from "node:test"
import assert from "node:assert/strict"

import {
  verifyV3ProductionCheckoutBinding
} from "../utils/verifyV3ProductionCheckoutBinding.js"

const ID = "507f1f77bcf86cd799439011"
const KEY = `signavi-v3-production-purchase-${ID}`

const fixture = () => ({
  order: {
    _id: ID,
    subtotal: 40,
    tax: 3.30,
    shipping: 6.65,
    shippingCost: 6.65,
    shippingTotal: 6.65,
    deliveryFee: 6.65,
    finalPrice: 49.95,
    squareEnvironment: "production",
    squareExpectedAmountCents: 4995
  },
  prepared: {
    orderId: ID,
    subtotalCents: 4000,
    taxCents: 330,
    shippingAmountCents: 665,
    totalCents: 4995
  },
  reservation: {
    environment: "production",
    orderId: ID,
    purchaseKey: KEY,
    idempotencyKey: KEY,
    claimedByDocumentType: "order",
    claimedByDocumentId: ID,
    status: "reserved",
    attemptClaimedAt: null,
    checkoutClaimOwner: null,
    checkoutClaimAmountCents: null
  },
  operation: {
    environment: "production",
    orderId: ID,
    idempotencyKey: KEY,
    amountCents: 4995,
    status: "pending",
    squareCreationAttemptClaimedAt: null,
    requestOwner: "",
    squareIdempotencyKey: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  }
})

test("Valid production payment binding verifies", () => {
  const result = verifyV3ProductionCheckoutBinding(fixture())

  assert.equal(result.verified, true)
  assert.equal(result.amountCents, 4995)
  assert.equal(result.purchaseKey, KEY)
  assert.equal(result.squareRequestAuthorized, false)
})

test("Payment operation amount mismatch blocks", () => {
  const data = fixture()
  data.operation.amountCents = 5995

  const result = verifyV3ProductionCheckoutBinding(data)

  assert.equal(result.verified, false)
  assert.equal(result.reason, "PRODUCTION_OPERATION_MISMATCH")
})

test("Previously claimed reservation blocks", () => {
  const data = fixture()
  data.reservation.status = "claim_pending"
  data.reservation.attemptClaimedAt = new Date()

  const result = verifyV3ProductionCheckoutBinding(data)

  assert.equal(result.verified, false)
})

test("Existing Square attempt identity blocks", () => {
  const data = fixture()
  data.operation.squareIdempotencyKey = "existing-attempt"

  const result = verifyV3ProductionCheckoutBinding(data)

  assert.equal(result.verified, false)
})

test("Conflicting production purchase key blocks", () => {
  const data = fixture()
  data.reservation.purchaseKey = "another-purchase"

  const result = verifyV3ProductionCheckoutBinding(data)

  assert.equal(result.verified, false)
})

test("Unbound production order amount blocks", () => {
  const data = fixture()
  data.order.squareExpectedAmountCents = null

  const result = verifyV3ProductionCheckoutBinding(data)

  assert.equal(result.verified, false)
  assert.equal(result.reason, "PRODUCTION_ORDER_AMOUNT_NOT_BOUND")
})

test("Altered shipping field blocks", () => {
  const data = fixture()
  data.order.shippingCost = 9.65

  const result = verifyV3ProductionCheckoutBinding(data)

  assert.equal(result.verified, false)
  assert.equal(result.reason, "SHIPPING_FIELD_MISMATCH")
})