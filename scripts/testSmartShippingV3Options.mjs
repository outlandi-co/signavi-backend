import assert from "node:assert/strict"
import { selectV3ShippingOptions } from "../utils/smartShippingV3Options.js"

const makeRate = (carrier, token, name, amount, ids) => ({
  provider: carrier,
  servicelevel: { token, name },
  amount,
  currency: "USD",
  parcelRateIds: ids
})

const rates = [
  makeRate(
    "USPS", "usps_ground_advantage",
    "Ground Advantage", "13.40", ["ground_1", "ground_2"]
  ),
  makeRate(
    "UPS", "ups_ground",
    "Ground", "12.50", ["ups_1", "ups_2"]
  ),
  makeRate(
    "USPS", "usps_priority",
    "Priority Mail", "17.27", ["priority_1", "priority_2"]
  ),
  makeRate(
    "USPS", "usps_priority_express",
    "Priority Mail Express", "74.36", ["express_1", "express_2"]
  )
]

const options = selectV3ShippingOptions(rates, 2)

assert.equal(options.length, 2)
assert.equal(options[0].category, "standard")
assert.equal(options[0].amount, "12.50")
assert.equal(options[0].carrier, "UPS")

assert.equal(options[1].category, "expedited")
assert.equal(options[1].amount, "17.27")
assert.equal(options[1].carrier, "USPS")

assert.deepEqual(
  options[1].parcelRateIds,
  ["priority_1", "priority_2"]
)

console.log("STANDARD SHIPPING: PASS ($12.50)")
console.log("EXPEDITED SHIPPING: PASS ($17.27)")

const incomplete = selectV3ShippingOptions([
  makeRate(
    "USPS", "usps_ground_advantage",
    "Ground Advantage", "6.70", ["only_one"]
  )
], 2)

assert.equal(incomplete.length, 0)
console.log("INCOMPLETE PARCEL QUOTE: PASS (rejected)")

const duplicated = selectV3ShippingOptions([
  makeRate(
    "USPS", "usps_ground_advantage",
    "Ground Advantage", "13.40", ["same_id", "same_id"]
  )
], 2)

assert.equal(duplicated.length, 0)
console.log("DUPLICATE PARCEL RATE IDS: PASS (rejected)")

assert.deepEqual(selectV3ShippingOptions([], 2), [])
assert.deepEqual(selectV3ShippingOptions(rates, 0), [])

console.log("INVALID INPUTS: PASS")
const correctedUpsTokens = [
  "ups_second_day_air",
  "ups_second_day_air_am",
  "ups_next_day_air_early_am"
]

for (const token of correctedUpsTokens) {
  const selected = selectV3ShippingOptions([
    makeRate(
      "UPS",
      token,
      "UPS Test Service",
      "25.00",
      ["ups_parcel_1", "ups_parcel_2"]
    )
  ], 2)

  assert.equal(selected.length, 1)
  assert.equal(selected[0].category, "expedited")
  assert.equal(selected[0].serviceToken, token)
}

console.log("CORRECTED UPS TOKENS: PASS (3 services)")
console.log("ALL V3 SHIPPING OPTIONS TESTS PASSED")