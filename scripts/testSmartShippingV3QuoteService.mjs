import assert from "node:assert/strict"
import { quoteV3Parcels } from "../utils/smartShippingV3QuoteService.js"

const from = {
  name: "Test Sender",
  street1: "123 Test Street",
  city: "Test City",
  state: "CA",
  zip: "90001",
  country: "US"
}

const to = {
  name: "Test Recipient",
  street1: "456 Test Avenue",
  city: "Test City",
  state: "CA",
  zip: "90002",
  country: "US"
}

const parcel = {
  length: "14",
  width: "12",
  height: "4",
  distance_unit: "in",
  weight: "42",
  mass_unit: "oz",
  uspsFlatRate: false
}

const rate = (id, amount) => ({
  object_id: id,
  amount,
  currency: "USD",
  provider: "USPS",
  carrier_account: "test_account",
  servicelevel: { token: "ground" }
})

let requests = 0

const result = await quoteV3Parcels({
  from,
  to,
  parcels: [parcel, parcel, parcel],
  carrierAccountIds: ["test_account"],
  requestShipment: async (data) => {
    requests++

    assert.equal(data.parcels.length, 1)
    assert.deepEqual(
      data.carrier_accounts,
      ["test_account"]
    )

    return {
      rates: [rate(`parcel_${requests}`, "6.00")]
    }
  }
})

assert.equal(requests, 3)
assert.equal(result.success, true)
assert.equal(result.parcelCount, 3)
assert.equal(result.rates.length, 1)
assert.equal(result.rates[0].amount, "18.00")
assert.equal(result.rates[0].parcelRateIds.length, 3)

console.log("THREE-PARCEL SHIPPO QUOTE: PASS ($18.00)")

let flatRateRequests = 0

await assert.rejects(
  quoteV3Parcels({
    from,
    to,
    parcels: [{
      ...parcel,
      uspsFlatRate: true,
      shippoParcelTemplate: "USPS_MediumFlatRateBox1"
    }],
    requestShipment: async () => {
      flatRateRequests++
      return { rates: [] }
    }
  }),
  /Flat Rate quoting is not enabled/
)

assert.equal(flatRateRequests, 0)
console.log("USPS FLAT RATE SAFETY: PASS (blocked)")

await assert.rejects(
  quoteV3Parcels({
    from,
    to,
    parcels: [{
      ...parcel,
      weight: "-1"
    }],
    requestShipment: async () => {
      throw new Error("Should not be called")
    }
  }),
  /Invalid parcel measurements/
)

console.log("INVALID PARCEL: PASS (rejected)")

const noCommonRates = await quoteV3Parcels({
  from,
  to,
  parcels: [parcel, parcel],
  requestShipment: async () => {
    const number = ++requests

    return {
      rates: [{
        ...rate(`different_${number}`, "7.00"),
        servicelevel: {
          token: number % 2 === 0 ? "ground" : "priority"
        }
      }]
    }
  }
})

assert.equal(noCommonRates.rates.length, 0)
console.log("INCOMPATIBLE SERVICES: PASS (no rates offered)")

console.log("ALL V3 SHIPPO QUOTE SERVICE TESTS PASSED")