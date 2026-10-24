import assert from "node:assert/strict"
import crypto from "node:crypto"
import { createV3OrderFingerprint } from "../utils/smartShippingV3OrderFingerprint.js"
import {
  createV3SignedQuote,
  verifyV3SignedQuote
} from "../utils/smartShippingV3QuoteSigning.js"

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

const now = 1_800_000_000_000

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

const fingerprint = createV3OrderFingerprint(order)

const token = createV3SignedQuote({
  cartFingerprint: fingerprint,
  shippingAmountCents: 1200,
  parcelRateIds: ["rate_1", "rate_2"],
  carrier: "USPS",
  serviceToken: "usps_ground_advantage",
  now
})

const verifyForOrder = (savedOrder) =>
  verifyV3SignedQuote({
    token,
    cartFingerprint: createV3OrderFingerprint(savedOrder),
    now: now + 1000
  })

assert.ok(verifyForOrder(order))
console.log("ORIGINAL SAVED ORDER: PASS (accepted)")

const changes = [
  ["DIFFERENT ORDER", o => {
    o._id = "cccccccccccccccccccccccc"
  }],
  ["CHANGED QUANTITY", o => {
    o.items[0].quantity = 3
  }],
  ["CHANGED PRICE", o => {
    o.items[0].finalPrice = 9.99
  }],
  ["CHANGED VARIANT", o => {
    o.items[0].variant.size = "XL"
  }],
  ["CHANGED ADDRESS", o => {
    o.address.street = "456 Example Street"
  }]
]

for (const [name, change] of changes) {
  const changed = structuredClone(order)
  change(changed)

  assert.equal(verifyForOrder(changed), null)
  console.log(`${name}: PASS (quote rejected)`)
}

assert.equal(
  verifyV3SignedQuote({
    token,
    cartFingerprint: fingerprint,
    now: now + 15 * 60 * 1000
  }),
  null
)

console.log("EXPIRED ORDER QUOTE: PASS (rejected)")
console.log("ALL V3 ORDER-BOUND QUOTE TESTS PASSED")