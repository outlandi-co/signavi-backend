import assert from "node:assert/strict"
import { selectV3ShippingOptions } from "../utils/smartShippingV3Options.js"

const makeRate = (provider, token, amount) => ({
  provider,
  servicelevel: { token, name: "Test Service" },
  amount,
  currency: "USD",
  parcelRateIds: ["parcel_1", "parcel_2"]
})

const valid = selectV3ShippingOptions([
  makeRate("USPS", "usps_ground_advantage", "13.40"),
  makeRate("UPS", "ups_second_day_air", "24.94")
], 2)

assert.equal(valid.length, 2)
console.log("VALID USPS AND UPS OPTIONS: PASS")

const mismatched = selectV3ShippingOptions([
  makeRate("USPS", "ups_ground", "1.00"),
  makeRate("UPS", "usps_priority", "2.00")
], 2)

assert.equal(
  mismatched.length,
  0,
  "Carrier/service mismatches must be rejected."
)

console.log("CARRIER/SERVICE MISMATCH: PASS (rejected)")
console.log("ALL CARRIER SECURITY TESTS PASSED")