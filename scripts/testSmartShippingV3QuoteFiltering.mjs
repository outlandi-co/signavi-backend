import assert from "node:assert/strict"
import { combineV3ParcelRates } from "../utils/smartShippingV3Rates.js"
import { validateV3CombinedQuote } from "../utils/smartShippingV3QuoteIntegrity.js"
import { selectV3ShippingOptions } from "../utils/smartShippingV3Options.js"

const shipment = (id, amount) => ({
  rates: [{
    object_id: id,
    provider: "USPS",
    carrier_account: "test_account",
    servicelevel: {
      token: "usps_ground_advantage",
      name: "Ground Advantage"
    },
    amount,
    currency: "USD"
  }]
})

const combined = combineV3ParcelRates([
  shipment("rate_1", "6.00"),
  shipment("rate_2", "7.00")
])

assert.equal(combined.length, 1)
assert.equal(combined[0].amount, "13.00")

const getOptions = (rates) =>
  selectV3ShippingOptions(
    rates.filter(rate => validateV3CombinedQuote(rate, 2)),
    2
  )

const validOptions = getOptions(combined)
assert.equal(validOptions.length, 1)
assert.equal(validOptions[0].amount, "13.00")

console.log("VALID COMBINED QUOTE: PASS ($13.00)")

const tampered = structuredClone(combined)
tampered[0].amount = "1.00"

assert.equal(validateV3CombinedQuote(tampered[0], 2), false)
assert.equal(getOptions(tampered).length, 0)

console.log("ALTERED SHIPPING PRICE: PASS (rejected)")

const missingParcel = structuredClone(combined)
missingParcel[0].parcelRates.pop()

assert.equal(getOptions(missingParcel).length, 0)

console.log("MISSING PARCEL CHARGE: PASS (rejected)")

const duplicateId = structuredClone(combined)
duplicateId[0].parcelRateIds[1] = duplicateId[0].parcelRateIds[0]

assert.equal(getOptions(duplicateId).length, 0)

console.log("DUPLICATE PARCEL ID: PASS (rejected)")
console.log("ALL V3 QUOTE FILTERING TESTS PASSED")