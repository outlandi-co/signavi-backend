import assert from "node:assert/strict"
import mongoose from "mongoose"
import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"
import {
  verifyV3OrderPaymentBinding
} from "../utils/smartShippingV3OrderPaymentBinding.js"

const orderId = new mongoose.Types.ObjectId()
const otherId = new mongoose.Types.ObjectId()

const makeFixture = () => ({
  order: {
    _id: orderId,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "usd",
    paymentUrl: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    squarePaymentId: ""
  },
  prepared: {
    orderId: String(orderId),
    subtotalCents: 3998,
    taxCents: 330,
    shippingAmountCents: 1200,
    totalCents: 5528
  },
  operation: {
    orderId,
    checkoutReferenceId:
      createV3CheckoutReference({ orderId }),
    amountCents: 5528,
    environment: "sandbox",
    status: "pending",
    idempotencyKey: "signavi-v3-sandbox-test-key"
  }
})

const good = makeFixture()
const verified = verifyV3OrderPaymentBinding(good)

assert.equal(verified.bindingVerified, true)
assert.equal(verified.amountCents, 5528)
assert.equal(verified.squareRequestAuthorized, false)

console.log("TRUSTED ORDER AND PAYMENT: PASS")
console.log("SQUARE REQUEST STILL BLOCKED: PASS")

const reject = (label, modify, pattern) => {
  const fixture = makeFixture()
  modify(fixture)

  assert.throws(
    () => verifyV3OrderPaymentBinding(fixture),
    pattern
  )

  console.log(`${label}: PASS (rejected)`)
}

reject(
  "DIFFERENT ORDER",
  f => { f.operation.orderId = otherId },
  /binding mismatch/
)

reject(
  "SUBSTITUTED REFERENCE",
  f => {
    f.operation.checkoutReferenceId =
      createV3CheckoutReference({ orderId: otherId })
  },
  /binding mismatch/
)

reject(
  "CHANGED PAYMENT TOTAL",
  f => { f.operation.amountCents = 9999 },
  /binding mismatch/
)

reject(
  "INVALID ARITHMETIC",
  f => { f.prepared.totalCents = 5529 },
  /binding mismatch/
)

reject(
  "PRODUCTION PAYMENT OPERATION",
  f => { f.operation.environment = "production" },
  /binding mismatch/
)

reject(
  "UNCERTAIN PAYMENT OPERATION",
  f => { f.operation.status = "reconciliation_required" },
  /binding mismatch/
)

reject(
  "PAID ORDER",
  f => { f.order.paymentStatus = "paid" },
  /not eligible/
)

reject(
  "EXISTING SQUARE LINK",
  f => { f.order.squarePaymentLinkId = "existing-link" },
  /not eligible/
)

reject(
  "INVALID ORDER SOURCE",
  f => { f.order.source = "admin" },
  /not eligible/
)

reject(
  "WRONG CURRENCY",
  f => { f.order.currency = "eur" },
  /not eligible/
)

reject(
  "INVALID IDEMPOTENCY KEY",
  f => { f.operation.idempotencyKey = "untrusted-key" },
  /binding mismatch/
)

console.log("ALL V3 ORDER/PAYMENT BINDING TESTS PASSED")