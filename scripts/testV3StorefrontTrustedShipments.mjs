import assert from "node:assert/strict"
import {
  createV3StorefrontTrustedShipments
} from "../utils/createV3StorefrontTrustedShipments.js"

const order = {
  _id: "507f1f77bcf86cd799439011",
  customerName: "Test Customer",
  address: {
    street: "123 Example Street",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: "507f191e810c19729de860ea",
    quantity: 2,
    finalPrice: 20,
    forgedWeight: 999,
    forgedShippingPrice: 0.01
  }]
}

const parcels = [
  { weight: "12", mass_unit: "oz" },
  { weight: "10", mass_unit: "oz" }
]

const calls = []
let failParcel = -1

const provider = createV3StorefrontTrustedShipments({
  buildParcels: async (items, packages) => {
    calls.push({ type: "build", items, packages })
    return { parcels }
  },
  requestRates: async ({ from, to, parcels, token }) => {
    const index = calls.filter(c => c.type === "rate").length
    calls.push({ type: "rate", from, to, parcels, token })

    if (index === failParcel) return { rates: [] }

    return {
      rates: [{
        object_id: `rate_${index}`,
        provider: "USPS",
        carrier_account: "test_account",
        servicelevel: {
          token: "usps_ground_advantage",
          name: "Ground Advantage"
        },
        amount: "6.00",
        currency: "USD"
      }]
    }
  },
  getPackages: () => [{ name: "test_package" }],
  getShipFrom: () => ({ zip: "95340" }),
  getDestination: address => {
    assert.equal(address.street1, order.address.street)
    assert.equal(address.zip, order.address.zip)
    return address
  },
  getToken: () => "isolated_test_token"
})

const results = await provider(order)

assert.equal(results.length, 2)
assert.equal(calls.filter(c => c.type === "rate").length, 2)

const build = calls.find(c => c.type === "build")

assert.deepEqual(build.items, [{
  productId: order.items[0].productId,
  quantity: 2
}])

for (const rateCall of calls.filter(c => c.type === "rate")) {
  assert.equal(rateCall.parcels.length, 1)
  assert.equal(rateCall.token, "isolated_test_token")
}

console.log("SAVED ORDER ITEMS ONLY: PASS")
console.log("BROWSER WEIGHT/PRICE IGNORED: PASS")
console.log("TWO PARCELS, TWO RATE REQUESTS: PASS")

failParcel = 1
calls.length = 0

await assert.rejects(
  () => provider(order),
  /Incomplete carrier shipment rates/
)

console.log("MISSING SECOND PARCEL RATES: PASS")

failParcel = -1

await assert.rejects(
  () => provider({ ...order, address: null }),
  /Invalid saved shipping order/
)

console.log("MISSING ADDRESS: PASS")

await assert.rejects(
  () => provider({ ...order, items: [] }),
  /Invalid saved shipping order/
)

console.log("EMPTY CART: PASS")

const invalidPlan = createV3StorefrontTrustedShipments({
  buildParcels: async () => ({
    parcels: Array.from({ length: 11 }, () => ({}))
  }),
  requestRates: async () => {
    throw new Error("Must not request rates")
  },
  getPackages: () => [{}],
  getShipFrom: () => ({}),
  getDestination: () => ({}),
  getToken: () => "isolated_test_token"
})

await assert.rejects(
  () => invalidPlan(order),
  /Invalid saved-order parcel plan/
)

console.log("MORE THAN TEN PARCELS: PASS")

console.log("ALL TRUSTED CARRIER PROVIDER TESTS PASSED")