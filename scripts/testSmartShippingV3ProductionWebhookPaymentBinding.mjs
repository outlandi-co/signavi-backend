import assert from "node:assert/strict"
import { verifyV3ProductionWebhookPaymentBinding } from "../utils/smartShippingV3ProductionWebhookPaymentBinding.js"

const id = "507f1f77bcf86cd799439011"
const locationId = "PRODUCTION_TEST_LOCATION"

const fixture = () => ({
  order: {
    _id: id,
    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "production",
    currency: "USD",
    squareExpectedAmountCents: 1234
  },
  operation: {
    orderId: id,
    environment: "production",
    status: "completed",
    requestOwner: "synthetic-owner",
    idempotencyKey: `signavi-v3-production-order-${id}`,
    squarePaymentLinkId: "synthetic-link-id",
    squareOrderId: "synthetic-square-order",
    paymentUrl: "https://square.link/test-reference",
    checkoutReferenceId: `signavi-v3-${id}`,
    amountCents: 1234
  },
  payment: {
    id: "synthetic-payment",
    status: "COMPLETED",
    order_id: "synthetic-square-order",
    location_id: locationId,
    amount_money: {
      amount: 1234,
      currency: "USD"
    }
  },
  squareOrder: {
    id: "synthetic-square-order",
    reference_id: `signavi-v3-${id}`,
    location_id: locationId,
    total_money: {
      amount: 1234,
      currency: "USD"
    }
  },
  expectedLocationId: locationId
})

let passed = 0

function check(name, action) {
  action()
  passed++
  console.log("PASS:", name)
}

function rejected(name, mutate) {
  check(name, () => {
    const f = fixture()
    mutate(f)
    assert.throws(
      () => verifyV3ProductionWebhookPaymentBinding(f),
      /rejected/
    )
  })
}

check("Valid synthetic production payment", () => {
  const result = verifyV3ProductionWebhookPaymentBinding(fixture())

  assert.equal(result.bindingVerified, true)
  assert.equal(result.environment, "production")
  assert.equal(result.exactPaidReplay, false)
  assert.equal(result.databaseWriteAuthorized, false)
  assert.equal(result.paymentCreationAuthorized, false)
})

rejected("Reject sandbox order", f => {
  f.order.squareEnvironment = "sandbox"
})

rejected("Reject sandbox operation", f => {
  f.operation.environment = "sandbox"
})

rejected("Reject sandbox idempotency key", f => {
  f.operation.idempotencyKey = `signavi-v3-sandbox-${id}`
})

rejected("Reject wrong payment amount", f => {
  f.payment.amount_money.amount = 999
})

rejected("Reject wrong order amount", f => {
  f.squareOrder.total_money.amount = 999
})

rejected("Reject wrong payment location", f => {
  f.payment.location_id = "WRONG_LOCATION"
})

rejected("Reject wrong Square order", f => {
  f.payment.order_id = "WRONG_ORDER"
})

rejected("Reject invalid checkout reference", f => {
  f.squareOrder.reference_id = "invalid-reference"
})

rejected("Reject non-completed payment", f => {
  f.payment.status = "PENDING"
})

rejected("Reject sandbox payment URL", f => {
  f.operation.paymentUrl = "https://sandbox.square.link/abc"
})

rejected("Reject lookalike payment domain", f => {
  f.operation.paymentUrl = "https://square.link.evil.example/abc"
})

rejected("Reject HTTP payment URL", f => {
  f.operation.paymentUrl = "http://square.link/abc"
})

check("Exact paid webhook replay", () => {
  const f = fixture()

  f.order.status = "paid"
  f.order.paymentStatus = "paid"
  f.order.squarePaymentId = f.payment.id
  f.order.squareOrderId = f.squareOrder.id

  const result = verifyV3ProductionWebhookPaymentBinding(f)

  assert.equal(result.bindingVerified, true)
  assert.equal(result.exactPaidReplay, true)
  assert.equal(result.databaseWriteAuthorized, false)
})

console.log("")
console.log(`PRODUCTION WEBHOOK VERIFIER: ${passed} TESTS PASSED`)
console.log("NO SQUARE REQUESTS")
console.log("NO DATABASE WRITES")
