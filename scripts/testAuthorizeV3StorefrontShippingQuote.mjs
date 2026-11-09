import assert from "node:assert/strict"
import crypto from "node:crypto"
import { createGuestCheckoutToken } from "../utils/guestCheckoutToken.js"
import { authorizeV3StorefrontShippingQuote } from "../utils/authorizeV3StorefrontShippingQuote.js"

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")

const order = {
  _id: "507f1f77bcf86cd799439011",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  customerName: "Test Customer",
  address: {
    street: "123 Test Street",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: "507f191e810c19729de860ea",
    quantity: 2,
    finalPrice: 20,
    variant: {
      color: "black",
      size: "L"
    }
  }]
}

const token = createGuestCheckoutToken(order)

const run = (changes = {}) =>
  authorizeV3StorefrontShippingQuote({
    order,
    guestToken: token,
    ...changes
  })

const authorized = run()

assert.ok(authorized)
assert.equal(authorized.orderId, String(order._id))
assert.match(authorized.fingerprint, /^[a-f0-9]{64}$/)
console.log("VALID UNPAID ORDER: PASS")

assert.equal(run({ guestToken: "invalid" }), null)
console.log("INVALID TOKEN: PASS")

assert.equal(run({ guestToken: "" }), null)
console.log("MISSING TOKEN: PASS")

assert.equal(
  run({ order: { ...order, paymentStatus: "paid" } }),
  null
)
console.log("PAID ORDER: PASS")

assert.equal(
  run({ order: { ...order, status: "shipped" } }),
  null
)
console.log("SHIPPED ORDER: PASS")

assert.equal(
  run({ order: { ...order, squareOrderId: "sq_test" } }),
  null
)
console.log("EXISTING SQUARE ORDER: PASS")

assert.equal(
  run({ order: { ...order, source: "admin" } }),
  null
)
console.log("INVALID ORDER SOURCE: PASS")

assert.equal(
  run({ order: { ...order, address: null } }),
  null
)
console.log("INVALID ORDER ADDRESS: PASS")

console.log("ALL V3 SHIPPING AUTHORIZATION TESTS PASSED")