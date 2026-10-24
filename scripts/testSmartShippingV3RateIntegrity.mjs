import assert from "node:assert/strict"
import { combineV3ParcelRates } from "../utils/smartShippingV3Rates.js"

const shipment = (id, amount, overrides = {}) => ({
  rates: [{
    object_id: id,
    provider: "USPS",
    carrier_account: "test_account",
    servicelevel: {
      token: "usps_ground_advantage",
      name: "Ground Advantage"
    },
    amount,
    currency: "USD",
    ...overrides
  }]
})

const valid = combineV3ParcelRates([
  shipment("r1", "6.00"),
  shipment("r2", "7.25"),
  shipment("r3", "8.50")
])

assert.equal(valid.length, 1)
assert.equal(valid[0].amount, "21.75")
assert.deepEqual(valid[0].parcelRateIds, ["r1", "r2", "r3"])

console.log("VALID THREE-PARCEL TOTAL: PASS ($21.75)")

const invalidAmounts = [
  "", "abc", "-5.00", "0.00",
  "6.999", "Infinity", null
]

for (const amount of invalidAmounts) {
  const result = combineV3ParcelRates([
    shipment("r1", "6.00"),
    shipment("r2", amount)
  ])

  assert.equal(result.length, 0)
}

console.log("INVALID AMOUNTS: PASS (7 rejected)")

assert.equal(
  combineV3ParcelRates([
    shipment("r1", "6.00"),
    { rates: [] }
  ]).length,
  0
)

console.log("MISSING PARCEL RATE: PASS")

assert.equal(
  combineV3ParcelRates([
    shipment("r1", "6.00"),
    shipment("r2", "9.00", {
      servicelevel: {
        token: "usps_priority",
        name: "Priority Mail"
      }
    })
  ]).length,
  0
)

console.log("MISMATCHED SERVICES: PASS")

const secureShipment = (
  id,
  account = "account_1",
  provider = "USPS"
) => ({
  rates: [{
    object_id: id,
    provider,
    carrier_account: account,
    servicelevel: {
      token: "usps_ground_advantage",
      name: "Ground Advantage"
    },
    amount: "6.00",
    currency: "USD"
  }]
})

const duplicateIds = combineV3ParcelRates([
  secureShipment("same_rate"),
  secureShipment("same_rate")
])

assert.equal(duplicateIds.length, 0)
console.log("DUPLICATE RATE IDS: PASS (rejected)")

const differentAccounts = combineV3ParcelRates([
  secureShipment("rate_1", "account_1"),
  secureShipment("rate_2", "account_2")
])

assert.equal(differentAccounts.length, 0)
console.log("MISMATCHED CARRIER ACCOUNTS: PASS (rejected)")

const differentCarriers = combineV3ParcelRates([
  secureShipment("rate_1", "account_1", "USPS"),
  secureShipment("rate_2", "account_1", "UPS")
])

assert.equal(differentCarriers.length, 0)
console.log("MISMATCHED CARRIERS: PASS (rejected)")
console.log("ALL V3 RATE INTEGRITY TESTS PASSED")