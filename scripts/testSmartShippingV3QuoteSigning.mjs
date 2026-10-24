import assert from "node:assert/strict"
import crypto from "node:crypto"
import {
  createV3SignedQuote,
  verifyV3SignedQuote
} from "../utils/smartShippingV3QuoteSigning.js"

// Isolated test secret; does not modify .env or Render.
process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

const now = 1_800_000_000_000
const cartFingerprint = "a".repeat(64)
const otherCart = "b".repeat(64)

const quote = {
  cartFingerprint,
  shippingAmountCents: 2400,
  parcelRateIds: ["rate_1", "rate_2", "rate_3", "rate_4"],
  carrier: "USPS",
  serviceToken: "usps_ground_advantage",
  now
}

const token = createV3SignedQuote(quote)

const verified = verifyV3SignedQuote({
  token,
  cartFingerprint,
  now: now + 1000
})

assert.ok(verified)
assert.equal(verified.shippingAmountCents, 2400)
assert.equal(verified.parcelRateIds.length, 4)
assert.equal(verified.carrier, "USPS")

console.log("VALID SIGNED QUOTE: PASS ($24.00)")

assert.equal(
  verifyV3SignedQuote({
    token,
    cartFingerprint: otherCart,
    now: now + 1000
  }),
  null
)

console.log("DIFFERENT CART: PASS (rejected)")

const [encoded, signature] = token.split(".")

const alteredPayload = JSON.parse(
  Buffer.from(encoded, "base64url").toString("utf8")
)

alteredPayload.shippingAmountCents = 100

const alteredToken =
  Buffer.from(JSON.stringify(alteredPayload)).toString("base64url") +
  "." + signature

assert.equal(
  verifyV3SignedQuote({
    token: alteredToken,
    cartFingerprint,
    now: now + 1000
  }),
  null
)

console.log("ALTERED SHIPPING PRICE: PASS (rejected)")

const badSignature = `${encoded}.${"A".repeat(43)}`

assert.equal(
  verifyV3SignedQuote({
    token: badSignature,
    cartFingerprint,
    now: now + 1000
  }),
  null
)

console.log("INVALID SIGNATURE: PASS (rejected)")

assert.equal(
  verifyV3SignedQuote({
    token,
    cartFingerprint,
    now: now + 15 * 60 * 1000
  }),
  null
)

console.log("EXPIRED QUOTE: PASS (rejected)")

assert.equal(
  verifyV3SignedQuote({
    token,
    cartFingerprint,
    now: now - 1
  }),
  null
)

console.log("FUTURE-DATED QUOTE: PASS (rejected)")

assert.throws(() => createV3SignedQuote({
  ...quote,
  parcelRateIds: ["rate_1", "rate_1"]
}))

console.log("DUPLICATE RATE IDS: PASS (rejected)")

assert.throws(() => createV3SignedQuote({
  ...quote,
  carrier: "UPS"
}))

console.log("CARRIER/SERVICE MISMATCH: PASS (rejected)")

console.log("ALL V3 QUOTE SIGNING TESTS PASSED")