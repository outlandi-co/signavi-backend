import test from "node:test"
import assert from "node:assert/strict"

import {
  buildVerifiedShippoShipmentParcels
} from "./buildVerifiedShippoShipmentParcels.mjs"

const parcel = {
  length: "12",
  width: "10",
  height: "4",
  distance_unit: "in",
  weight: "23",
  mass_unit: "oz"
}

const regular = {
  carrier: "Generic",
  uspsFlatRate: false,
  shippoParcelTemplate: ""
}

const flatRate = {
  carrier: "USPS",
  uspsFlatRate: true,
  shippoParcelTemplate: "USPS_SmallFlatRateBox"
}

const pair = (p, packaging) => ({
  parcel: p,
  packaging
})

test("single regular parcel preserves dimensions", () => {
  const result = buildVerifiedShippoShipmentParcels([
    pair(parcel, regular)
  ])

  assert.equal(result.length, 1)
  assert.equal(result[0].length, "12")
  assert.equal(result[0].weight, "23")
})

test("single USPS Flat Rate parcel uses its template", () => {
  const result = buildVerifiedShippoShipmentParcels([
    pair(parcel, flatRate)
  ])

  assert.deepEqual(result[0], {
    template: "USPS_SmallFlatRateBox",
    weight: "23",
    mass_unit: "oz"
  })
})

test("two parcels retain independent packaging", () => {
  const result = buildVerifiedShippoShipmentParcels([
    pair(parcel, regular),
    pair({ ...parcel, weight: "16" }, flatRate)
  ])

  assert.equal(result.length, 2)
  assert.equal(result[0].template, undefined)
  assert.equal(result[0].length, "12")
  assert.equal(result[1].template, "USPS_SmallFlatRateBox")
  assert.equal(result[1].length, undefined)
  assert.equal(result[1].weight, "16")
})

test("missing packaging blocks entire shipment", () => {
  assert.throws(
    () => buildVerifiedShippoShipmentParcels([
      pair(parcel, regular),
      { parcel }
    ]),
    /Missing trusted parcel packaging pairing/
  )
})

test("invalid second parcel blocks entire shipment", () => {
  assert.throws(
    () => buildVerifiedShippoShipmentParcels([
      pair(parcel, regular),
      pair({ ...parcel, weight: "0" }, flatRate)
    ]),
    /Invalid verified parcel weight/
  )
})

test("unsupported Flat Rate template blocks shipment", () => {
  assert.throws(
    () => buildVerifiedShippoShipmentParcels([
      pair(parcel, {
        ...flatRate,
        shippoParcelTemplate: "USPS_FlatRateBox"
      })
    ]),
    /Unverified USPS Flat Rate template/
  )
})

test("zero and more than ten parcels fail closed", () => {
  for (const entries of [
    [],
    Array.from({ length: 11 }, () => pair(parcel, regular))
  ]) {
    assert.throws(
      () => buildVerifiedShippoShipmentParcels(entries),
      /Invalid verified shipment parcel count/
    )
  }
})

test("non-array input fails closed", () => {
  for (const value of [null, {}, undefined, "parcel"]) {
    assert.throws(
      () => buildVerifiedShippoShipmentParcels(value),
      /Invalid verified shipment parcel count/
    )
  }
})

test("ten valid parcels are supported", () => {
  const result = buildVerifiedShippoShipmentParcels(
    Array.from({ length: 10 }, () => pair(parcel, regular))
  )

  assert.equal(result.length, 10)
})

test("input records are not mutated", () => {
  const input = [pair(parcel, flatRate)]

  const result = buildVerifiedShippoShipmentParcels(input)

  assert.equal(input[0].parcel.length, "12")
  assert.equal(input[0].packaging.shippoParcelTemplate,
    "USPS_SmallFlatRateBox")
  assert.equal(result[0].length, undefined)
})