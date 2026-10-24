import assert from "node:assert/strict"
import crypto from "node:crypto"
import { createGuestCheckoutToken } from "../utils/guestCheckoutToken.js"
import { createV3OrderFingerprint } from "../utils/smartShippingV3OrderFingerprint.js"
import { createV3SignedQuote } from "../utils/smartShippingV3QuoteSigning.js"
import { prepareV3CheckoutPayment } from "../utils/smartShippingV3PaymentPreparation.js"

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

const order = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  customerName: "Test Customer",
  subtotal: 39.98,
  tax: 3.30,
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
  prepareV3CheckoutPayment({
    order,
    guestToken,
    signedQuote,
    now: now + 1000,
    ...changes
  })

const valid = verify()

assert.ok(valid)
assert.equal(valid.subtotalCents, 3998)
assert.equal(valid.taxCents, 330)
assert.equal(valid.shippingAmountCents, 1200)
assert.equal(valid.totalCents, 5528)

console.log("AUTHORIZED PAYMENT: PASS ($55.28)")
console.log("SERVER-CALCULATED TOTAL: PASS (3998 + 330 + 1200 cents)")

const cases = [
  ["ALREADY PAID", { paymentStatus: "paid" }],
  ["REFUNDED", { paymentStatus: "refunded" }],
  ["SHIPPED ORDER", { status: "shipped" }],
  ["DUPLICATE PAYMENT URL", { paymentUrl: "https://example.com/payment" }],
  ["EXISTING SQUARE LINK", { squarePaymentLinkId: "existing_link" }],
  ["EXISTING SQUARE ORDER", { squareOrderId: "existing_order" }],
  ["INVALID SUBTOTAL", { subtotal: -1 }],
  ["INVALID TAX", { tax: -1 }],
  ["INVALID MONEY PRECISION", { subtotal: 39.999 }],
  ["INVALID ORDER SOURCE", { source: "unknown" }]
]

for (const [name, changes] of cases) {
  const modified = structuredClone(order)
  Object.assign(modified, changes)

  assert.equal(
    verify({ order: modified }),
    null,
    `${name} must be rejected`
  )

  console.log(`${name}: PASS (rejected)`)
}

assert.equal(
  verify({ guestToken: "invalid" }),
  null
)

console.log("INVALID GUEST TOKEN: PASS (rejected)")

assert.equal(
  verify({ signedQuote: "invalid" }),
  null
)

console.log("INVALID SHIPPING SIGNATURE: PASS (rejected)")

assert.equal(
  verify({ now: now + 15 * 60 * 1000 }),
  null
)

console.log("EXPIRED SHIPPING QUOTE: PASS (rejected)")

console.log("ALL V3 PAYMENT PREPARATION TESTS PASSED")