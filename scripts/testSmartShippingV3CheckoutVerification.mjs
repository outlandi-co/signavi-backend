import assert from "node:assert/strict"
import crypto from "node:crypto"
import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"
import {
  createV3OrderFingerprint
} from "../utils/smartShippingV3OrderFingerprint.js"
import {
  createV3SignedQuote
} from "../utils/smartShippingV3QuoteSigning.js"
import {
  verifyV3CheckoutShipping
} from "../utils/smartShippingV3CheckoutVerification.js"

// Test-only secrets. No .env or Render changes.
process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

const order = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  customerName: "Test Customer",
  items: [{
    productId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    quantity: 2,
    finalPrice: 19.99,
    variant: { color: "black", size: "L" }
  }],
  address: {
    street: "123 Example Street",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  }
}

const now = Date.now()
const guestToken = createGuestCheckoutToken(order)

const signedQuote = createV3SignedQuote({
  cartFingerprint: createV3OrderFingerprint(order),
  shippingAmountCents: 1200,
  parcelRateIds: ["rate_1", "rate_2"],
  carrier: "USPS",
  serviceToken: "usps_ground_advantage",
  now
})

const verify = (changes = {}) =>
  verifyV3CheckoutShipping({
    order,
    guestToken,
    signedQuote,
    now: now + 1000,
    ...changes
  })

const valid = verify()

assert.ok(valid)
assert.equal(valid.shippingAmountCents, 1200)
assert.deepEqual(valid.parcelRateIds, ["rate_1", "rate_2"])
assert.equal(valid.carrier, "USPS")

console.log("AUTHORIZED CHECKOUT: PASS ($12.00)")

assert.equal(verify({ guestToken: "invalid" }), null)
console.log("INVALID GUEST TOKEN: PASS (rejected)")

assert.equal(verify({ guestToken: "" }), null)
console.log("MISSING GUEST TOKEN: PASS (rejected)")

const otherOrder = structuredClone(order)
otherOrder._id = "cccccccccccccccccccccccc"

assert.equal(verify({ order: otherOrder }), null)
console.log("DIFFERENT ORDER: PASS (rejected)")

const changedOrder = structuredClone(order)
changedOrder.items[0].quantity = 3

assert.equal(verify({
  order: changedOrder,
  guestToken: createGuestCheckoutToken(changedOrder)
}), null)

console.log("MODIFIED ORDER: PASS (rejected)")

assert.equal(
  verify({ now: now + 15 * 60 * 1000 }),
  null
)

console.log("EXPIRED SHIPPING QUOTE: PASS (rejected)")

const [payload, signature] = signedQuote.split(".")
const altered = JSON.parse(
  Buffer.from(payload, "base64url").toString("utf8")
)

altered.shippingAmountCents = 100

const tamperedQuote =
  Buffer.from(JSON.stringify(altered)).toString("base64url") +
  "." + signature

assert.equal(
  verify({ signedQuote: tamperedQuote }),
  null
)

console.log("ALTERED SHIPPING PRICE: PASS (rejected)")

console.log("ALL V3 CHECKOUT VERIFICATION TESTS PASSED")