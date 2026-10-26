import assert from "node:assert/strict"
import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"
import {
  verifyV3WebhookPaymentBinding
} from "../utils/smartShippingV3WebhookPaymentBinding.js"

const id = "507f191e810c19729de860ea"
const reference = createV3SquareSafeCheckoutReference({
  orderId: id
})

const fixture = () => ({
  order: {
    _id: id,
    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "sandbox",
    currency: "usd",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: "",
    squarePaymentId: "",
    paymentUrl: ""
  },
  operation: {
    orderId: id,
    environment: "sandbox",
    status: "completed",
    requestOwner: "synthetic-owner",
    idempotencyKey: "signavi-v3-sandbox-synthetic",
    checkoutReferenceId: reference,
    amountCents: 100,
    squarePaymentLinkId: "synthetic-link",
    squareOrderId: "synthetic-square-order",
    paymentUrl: "https://sandbox.square.link/u/synthetic"
  },
  payment: {
    id: "synthetic-payment",
    status: "COMPLETED",
    order_id: "synthetic-square-order",
    location_id: "synthetic-location",
    amount_money: { amount: 100, currency: "USD" }
  },
  squareOrder: {
    id: "synthetic-square-order",
    reference_id: reference,
    location_id: "synthetic-location",
    total_money: { amount: 100, currency: "USD" }
  },
  expectedLocationId: "synthetic-location"
})

const valid = verifyV3WebhookPaymentBinding(fixture())

assert.equal(valid.bindingVerified, true)
assert.equal(valid.amountCents, 100)
assert.equal(valid.databaseWriteAuthorized, false)
assert.equal(valid.paymentCreationAuthorized, false)

console.log("MATCHING V3 WEBHOOK PAYMENT: PASS")
console.log("NO WRITE OR CREATION AUTHORIZATION: PASS")

const rejects = [
  ["different order", f => { f.operation.orderId = "507f191e810c19729de860eb" }],
  ["unpaid Square payment", f => { f.payment.status = "PENDING" }],
  ["paid local order", f => { f.order.paymentStatus = "paid" }],
  ["incomplete operation", f => { f.operation.status = "reconciliation_required" }],
  ["wrong amount", f => { f.payment.amount_money.amount = 200 }],
  ["wrong Square total", f => { f.squareOrder.total_money.amount = 200 }],
  ["wrong currency", f => { f.payment.amount_money.currency = "EUR" }],
  ["wrong location", f => { f.squareOrder.location_id = "other-location" }],
  ["wrong merchant location", f => { f.payment.location_id = "other-location" }],
  ["wrong Square order", f => { f.payment.order_id = "other-order" }],
  ["wrong reference", f => { f.squareOrder.reference_id = "wrong-reference" }],
  ["missing link", f => { f.operation.squarePaymentLinkId = "" }],
  ["wrong stored link", f => { f.order.squarePaymentLinkId = "different-link" }],
  ["conflicting payment", f => { f.order.squarePaymentId = "different-payment" }],
  ["wrong environment", f => { f.operation.environment = "production" }],
  ["untrusted key", f => { f.operation.idempotencyKey = "untrusted" }]
]

for (const [name, mutate] of rejects) {
  const f = fixture()
  mutate(f)
  assert.throws(
    () => verifyV3WebhookPaymentBinding(f),
    /binding rejected/,
    name
  )
  console.log(`${name.toUpperCase()}: REJECTED`)
}

console.log("ALL 16 NEGATIVE V3 PAYMENT BINDINGS: PASS")
console.log("NO DATABASE CONNECTION OR WRITES")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("NO WEBHOOK ROUTE MODIFIED")