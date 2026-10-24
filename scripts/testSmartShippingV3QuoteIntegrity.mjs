import assert from "node:assert/strict"
import { validateV3CombinedQuote } from "../utils/smartShippingV3QuoteIntegrity.js"

const makeParcel = (id, amount) => ({
  object_id: id,
  provider: "USPS",
  carrier_account: "test_account",
  servicelevel: {
    token: "usps_ground_advantage",
    name: "Ground Advantage"
  },
  amount,
  currency: "USD"
})

const valid = {
  provider: "USPS",
  carrier_account: "test_account",
  servicelevel: {
    token: "usps_ground_advantage",
    name: "Ground Advantage"
  },
  amount: "21.75",
  currency: "USD",
  parcelRateIds: ["rate_1", "rate_2", "rate_3"],
  parcelRates: [
    makeParcel("rate_1", "6.00"),
    makeParcel("rate_2", "7.25"),
    makeParcel("rate_3", "8.50")
  ]
}

const clone = (value) => structuredClone(value)

assert.equal(validateV3CombinedQuote(valid, 3), true)
console.log("VALID THREE-PARCEL QUOTE: PASS ($21.75)")

const alteredTotal = clone(valid)
alteredTotal.amount = "20.75"

assert.equal(validateV3CombinedQuote(alteredTotal, 3), false)
console.log("ALTERED SHIPPING TOTAL: PASS (rejected)")

const duplicateIds = clone(valid)
duplicateIds.parcelRateIds[1] = "rate_1"

assert.equal(validateV3CombinedQuote(duplicateIds, 3), false)
console.log("DUPLICATE RATE IDS: PASS (rejected)")

const changedCarrier = clone(valid)
changedCarrier.parcelRates[1].provider = "UPS"

assert.equal(validateV3CombinedQuote(changedCarrier, 3), false)
console.log("MISMATCHED CARRIER: PASS (rejected)")

const changedAccount = clone(valid)
changedAccount.parcelRates[1].carrier_account = "other_account"

assert.equal(validateV3CombinedQuote(changedAccount, 3), false)
console.log("MISMATCHED CARRIER ACCOUNT: PASS (rejected)")

const changedService = clone(valid)
changedService.parcelRates[1].servicelevel.token = "usps_priority"

assert.equal(validateV3CombinedQuote(changedService, 3), false)
console.log("MISMATCHED SERVICE: PASS (rejected)")

const missingParcel = clone(valid)
missingParcel.parcelRates.pop()

assert.equal(validateV3CombinedQuote(missingParcel, 3), false)
console.log("MISSING PARCEL: PASS (rejected)")

const invalidAmount = clone(valid)
invalidAmount.parcelRates[1].amount = "7.999"

assert.equal(validateV3CombinedQuote(invalidAmount, 3), false)
console.log("INVALID PARCEL AMOUNT: PASS (rejected)")

const alteredCurrency = clone(valid)
alteredCurrency.parcelRates[1].currency = "EUR"

assert.equal(validateV3CombinedQuote(alteredCurrency, 3), false)
console.log("INCORRECT CURRENCY: PASS (rejected)")

assert.equal(validateV3CombinedQuote(valid, 4), false)
console.log("WRONG PARCEL COUNT: PASS (rejected)")

console.log("ALL V3 QUOTE INTEGRITY TESTS PASSED")