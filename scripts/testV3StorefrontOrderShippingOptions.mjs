import assert from "node:assert/strict"
import crypto from "node:crypto"

import { createV3StorefrontOrderShippingOptions } from "../utils/createV3StorefrontOrderShippingOptions.js"
import { createGuestCheckoutToken } from "../utils/guestCheckoutToken.js"
import { createV3OrderFingerprint } from "../utils/smartShippingV3OrderFingerprint.js"
import { verifyV3SignedQuote } from "../utils/smartShippingV3QuoteSigning.js"

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

const order = {
  _id: "507f1f77bcf86cd799439011",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  customerName: "Test Customer",
  address: {
    street: "123 Test Street",
    city: "Test City",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: "507f191e810c19729de860ea",
    name: "Test Shirt",
    quantity: 2,
    price: 20,
    finalPrice: 20,
    variant: {
      color: "black",
      size: "L"
    },
    selectedVariant: "Black / Large"
  }]
}

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")
const guestToken = createGuestCheckoutToken(order)
const now = Date.now()

const shipment = (id) => ({
  rates: [{
    object_id: `ground_${id}`,
    provider: "USPS",
    carrier_account: "test_account",
    servicelevel: {
      token: "usps_ground_advantage",
      name: "Ground Advantage"
    },
    amount: "6.00",
    currency: "USD"
  }]
})

const trustedShipments = [shipment(1), shipment(2)]

const run = (changes = {}) =>
  createV3StorefrontOrderShippingOptions({
    order,
    guestToken,
    trustedShipments,
    now,
    ...changes
  })

const result = run()

assert.ok(result)
assert.equal(result.orderId, String(order._id))
assert.equal(result.parcelCount, 2)
assert.equal(result.shippingOptions.length, 1)

const option = result.shippingOptions[0]

assert.equal(option.category, "standard")
assert.equal(option.amount, "12.00")
assert.equal(option.parcelRateIds.length, 2)

const verified = verifyV3SignedQuote({
  token: option.signedQuote,
  cartFingerprint: createV3OrderFingerprint(order),
  now: now + 1000
})

assert.ok(verified)
assert.equal(verified.shippingAmountCents, 1200)
console.log("VALID MULTI-PARCEL QUOTE: PASS")

assert.equal(run({ guestToken: "invalid" }), null)
console.log("INVALID GUEST TOKEN: PASS")

assert.equal(run({ guestToken: "" }), null)
console.log("MISSING GUEST TOKEN: PASS")

assert.equal(
  run({
    order: {
      ...order,
      paymentStatus: "paid"
    }
  }),
  null
)
console.log("PAID ORDER: PASS")

assert.equal(run({ trustedShipments: [] }), null)
console.log("EMPTY SHIPMENTS: PASS")

assert.equal(
  run({
    trustedShipments: [
      shipment(1),
      { rates: [] }
    ]
  }),
  null
)
console.log("INCOMPLETE PARCEL COVERAGE: PASS")

const otherOrder = {
  ...order,
  _id: "507f1f77bcf86cd799439012"
}

assert.equal(
  verifyV3SignedQuote({
    token: option.signedQuote,
    cartFingerprint: createV3OrderFingerprint(otherOrder),
    now: now + 1000
  }),
  null
)
console.log("DIFFERENT ORDER: PASS")

const changedOrder = {
  ...order,
  items: [{
    ...order.items[0],
    quantity: 3
  }]
}

assert.equal(
  verifyV3SignedQuote({
    token: option.signedQuote,
    cartFingerprint: createV3OrderFingerprint(changedOrder),
    now: now + 1000
  }),
  null
)
console.log("MODIFIED QUANTITY: PASS")

assert.equal(
  verifyV3SignedQuote({
    token: option.signedQuote,
    cartFingerprint: createV3OrderFingerprint(order),
    now: now + 31 * 60 * 1000
  }),
  null
)
console.log("EXPIRED QUOTE: PASS")

console.log("ALL STOREFRONT V3 ADAPTER TESTS PASSED")