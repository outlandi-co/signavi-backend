import assert from "node:assert/strict"
import crypto from "node:crypto"
import { combineV3ParcelRates } from "../utils/smartShippingV3Rates.js"
import { selectV3ShippingOptions } from "../utils/smartShippingV3Options.js"
import { signV3ShippingOptions } from "../utils/smartShippingV3SignedOptions.js"
import { verifyV3SignedQuote } from "../utils/smartShippingV3QuoteSigning.js"

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

const cartFingerprint = "a".repeat(64)
const now = 1_800_000_000_000

const shipment = (id) => ({
  rates: [
    {
      object_id: `ground_${id}`,
      provider: "USPS",
      carrier_account: "test_account",
      servicelevel: {
        token: "usps_ground_advantage",
        name: "Ground Advantage"
      },
      amount: "6.00",
      currency: "USD"
    },
    {
      object_id: `priority_${id}`,
      provider: "USPS",
      carrier_account: "test_account",
      servicelevel: {
        token: "usps_priority",
        name: "Priority Mail"
      },
      amount: "9.00",
      currency: "USD"
    }
  ]
})

const verifiedRates = combineV3ParcelRates([
  shipment(1),
  shipment(2),
  shipment(3),
  shipment(4)
])

const options = selectV3ShippingOptions(verifiedRates, 4)

assert.equal(options.length, 2)

const signed = signV3ShippingOptions({
  options,
  verifiedRates,
  parcelCount: 4,
  cartFingerprint,
  now
})

assert.equal(signed.length, 2)

for (const option of signed) {
  const payload = verifyV3SignedQuote({
    token: option.signedQuote,
    cartFingerprint,
    now: now + 1000
  })

  assert.ok(payload)
  assert.equal(payload.shippingAmountCents, Math.round(Number(option.amount) * 100))
  assert.deepEqual(payload.parcelRateIds, option.parcelRateIds)
  assert.equal(payload.carrier, option.carrier)
  assert.equal(payload.serviceToken, option.serviceToken)
}

console.log("STANDARD SIGNED QUOTE: PASS ($24.00)")
console.log("EXPEDITED SIGNED QUOTE: PASS ($36.00)")

const alteredPrice = structuredClone(options)
alteredPrice[0].amount = "1.00"

assert.throws(() => signV3ShippingOptions({
  options: alteredPrice,
  verifiedRates,
  parcelCount: 4,
  cartFingerprint,
  now
}))

console.log("ALTERED SHIPPING PRICE: PASS (rejected)")

const alteredIds = structuredClone(options)
alteredIds[0].parcelRateIds[0] = "fake_rate"

assert.throws(() => signV3ShippingOptions({
  options: alteredIds,
  verifiedRates,
  parcelCount: 4,
  cartFingerprint,
  now
}))

console.log("ALTERED RATE IDS: PASS (rejected)")

assert.equal(
  verifyV3SignedQuote({
    token: signed[0].signedQuote,
    cartFingerprint: "b".repeat(64),
    now: now + 1000
  }),
  null
)

console.log("DIFFERENT CART: PASS (rejected)")
console.log("ALL V3 SIGNED OPTIONS TESTS PASSED")