import assert from "node:assert/strict"
import Order from "../models/Order.js"
import {
  applyV3PreparedPayment,
  verifyV3AppliedPayment
} from "../utils/smartShippingV3ApplyPayment.js"

const id = "aaaaaaaaaaaaaaaaaaaaaaaa"

const prepared = {
  orderId: id,
  subtotalCents: 3998,
  taxCents: 330,
  shippingAmountCents: 1200,
  totalCents: 5528,
  parcelRateIds: ["rate_1", "rate_2"],
  carrier: "USPS",
  serviceToken: "usps_ground_advantage"
}

const order = new Order({
  _id: id,
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  customerName: "Test Customer",
  email: "test@example.com",
  subtotal: 39.98,
  tax: 3.30,
  finalPrice: 43.28,
  items: [{
    productId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    quantity: 2,
    finalPrice: 19.99,
    variant: { color: "black", size: "L" }
  }]
})

applyV3PreparedPayment(order, prepared)

assert.equal(verifyV3AppliedPayment(order, prepared), true)
console.log("V3 PAYMENT APPLICATION: PASS")

assert.equal(order.shipping, 12)
assert.equal(order.shippingCost, 12)
assert.equal(order.shippingTotal, 12)
assert.equal(order.deliveryFee, 12)
console.log("SHIPPING FIELDS: PASS ($12.00)")

assert.equal(order.finalPrice, 55.28)
console.log("PAYMENT TOTAL: PASS ($55.28)")

assert.deepEqual(
  [...order.shippingRateIds],
  ["rate_1", "rate_2"]
)
console.log("MULTI-PARCEL IDS: PASS")

const invalid = {
  ...prepared,
  totalCents: 100
}

assert.throws(() =>
  applyV3PreparedPayment(order, invalid)
)
console.log("INVALID PREPARED TOTAL: PASS (rejected)")

const otherOrder = new Order({
  _id: "cccccccccccccccccccccccc"
})

assert.throws(() =>
  applyV3PreparedPayment(otherOrder, prepared)
)
console.log("DIFFERENT ORDER: PASS (rejected)")

// Mongoose validation is not a database save.
// It exercises validation hooks where configured.
await order.validate()

assert.equal(
  verifyV3AppliedPayment(order, prepared),
  true,
  "Mongoose validation changed verified payment amounts"
)

console.log("MONGOOSE VALIDATION: PASS")
console.log("VERIFIED TOTAL AFTER VALIDATION: PASS ($55.28)")
console.log("ALL V3 PAYMENT APPLICATION TESTS PASSED")