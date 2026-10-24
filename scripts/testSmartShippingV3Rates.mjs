import assert from "node:assert/strict"
import { combineV3ParcelRates } from "../utils/smartShippingV3Rates.js"

const rate = (id, amount, service = "priority") => ({
  object_id: id,
  amount,
  currency: "USD",
  provider: "USPS",
  carrier_account: "test_account",
  servicelevel: { token: service }
})

const shipments = [
  { rates: [
    rate("p1_priority", "8.50"),
    rate("p1_ground", "6.00", "ground")
  ] },
  { rates: [
    rate("p2_priority", "7.25"),
    rate("p2_ground", "5.50", "ground")
  ] },
  { rates: [
    rate("p3_priority", "9.10"),
    rate("p3_ground", "7.00", "ground")
  ] }
]

const combined = combineV3ParcelRates(shipments)

assert.equal(combined.length, 2)
assert.equal(combined[0].amount, "18.50")
assert.equal(combined[1].amount, "24.85")

assert.deepEqual(
  combined[0].parcelRateIds,
  ["p1_ground", "p2_ground", "p3_ground"]
)

console.log("MULTI-PARCEL TOTALS: PASS")

const missingService = combineV3ParcelRates([
  { rates: [rate("one", "8.50")] },
  { rates: [rate("two", "7.25", "ground")] }
])

assert.equal(missingService.length, 0)
console.log("MISSING SERVICE: PASS (rejected)")

const differentAccounts = combineV3ParcelRates([
  { rates: [rate("one", "8.50")] },
  { rates: [{
    ...rate("two", "7.25"),
    carrier_account: "different_account"
  }] }
])

assert.equal(differentAccounts.length, 0)
console.log("DIFFERENT CARRIER ACCOUNTS: PASS (rejected)")

const invalidCurrency = combineV3ParcelRates([
  { rates: [rate("one", "8.50")] },
  { rates: [{
    ...rate("two", "7.25"),
    currency: "EUR"
  }] }
])

assert.equal(invalidCurrency.length, 0)
console.log("INVALID CURRENCY: PASS (rejected)")

assert.deepEqual(combineV3ParcelRates([]), [])
console.log("EMPTY SHIPMENTS: PASS")

console.log("ALL V3 MULTI-PARCEL RATE TESTS PASSED")