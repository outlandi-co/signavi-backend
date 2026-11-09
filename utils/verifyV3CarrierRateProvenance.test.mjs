import test from "node:test"
import assert from "node:assert/strict"
import {
  verifyV3CarrierRateProvenance as verify
} from "./verifyV3CarrierRateProvenance.mjs"

const packageId = "507f1f77bcf86cd799439012"

const parcel = weight => ({
  length: "12",
  width: "10",
  height: "4",
  distance_unit: "in",
  weight,
  mass_unit: "oz"
})

const packaging = {
  id: packageId,
  carrier: "Generic",
  uspsFlatRate: false,
  shippoParcelTemplate: ""
}

const makeRate = (id, amount, overrides = {}) => ({
  object_id: id,
  provider: "USPS",
  carrier_account: "test-account",
  servicelevel: { token: "usps_ground_advantage" },
  currency: "USD",
  amount,
  ...overrides
})

const first = makeRate("rate-001", "4.25")
const second = makeRate("rate-002", "5.75")

const fixture = () => ({
  parcelEntries: [
    { parcel: parcel("23"), packaging: { ...packaging } },
    { parcel: parcel("16"), packaging: { ...packaging } }
  ],
  shipments: [
    { rates: [{ ...first }] },
    { rates: [{ ...second }] }
  ],
  combinedRate: {
    ...first,
    amount: "10.00",
    parcelRateIds: ["rate-001", "rate-002"],
    parcelRates: [{ ...first }, { ...second }]
  }
})

test("valid ordered ordinary rates pass", () => {
  assert.equal(verify(fixture()), true)
})

test("rate belonging to another parcel fails", () => {
  const value = fixture()
  value.shipments.reverse()
  assert.equal(verify(value), false)
})

test("duplicate parcel rate IDs fail", () => {
  const value = fixture()
  value.combinedRate.parcelRateIds[1] = "rate-001"
  assert.equal(verify(value), false)
})

test("incorrect combined amount fails", () => {
  const value = fixture()
  value.combinedRate.amount = "10.01"
  assert.equal(verify(value), false)
})

test("different carrier account fails", () => {
  const value = fixture()
  value.shipments[1].rates[0].carrier_account = "other-account"
  assert.equal(verify(value), false)
})

test("different service fails", () => {
  const value = fixture()
  value.shipments[1].rates[0].servicelevel = {
    token: "usps_priority"
  }
  assert.equal(verify(value), false)
})

test("fabricated selected rate amount fails", () => {
  const value = fixture()
  value.combinedRate.parcelRates[0].amount = "4.00"
  assert.equal(verify(value), false)
})

test("missing shipment fails", () => {
  const value = fixture()
  value.shipments.pop()
  assert.equal(verify(value), false)
})

test("duplicate rate in a shipment fails", () => {
  const value = fixture()
  value.shipments[0].rates.push({ ...first })
  assert.equal(verify(value), false)
})

test("USPS Flat Rate remains blocked", () => {
  const value = fixture()
  value.parcelEntries[0].packaging = {
    ...packaging,
    carrier: "USPS",
    uspsFlatRate: true,
    shippoParcelTemplate: "USPS_SmallFlatRateBox"
  }
  assert.equal(verify(value), false)
})

test("missing package identity fails", () => {
  const value = fixture()
  delete value.parcelEntries[0].packaging.id
  assert.equal(verify(value), false)
})

test("missing classification fails", () => {
  const value = fixture()
  delete value.parcelEntries[0].packaging.uspsFlatRate
  assert.equal(verify(value), false)
})

test("incomplete input fails", () => {
  assert.equal(verify(), false)
  assert.equal(verify({}), false)
})