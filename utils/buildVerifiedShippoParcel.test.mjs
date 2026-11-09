import test from "node:test"
import assert from "node:assert/strict"
import {
  buildVerifiedShippoParcel
} from "./buildVerifiedShippoParcel.mjs"

const parcel = {
  length: "12",
  width: "10",
  height: "4",
  distance_unit: "in",
  weight: "23",
  mass_unit: "oz"
}

const ordinary = {
  carrier: "Generic",
  uspsFlatRate: false,
  shippoParcelTemplate: ""
}

const flatRate = {
  carrier: "USPS",
  uspsFlatRate: true,
  shippoParcelTemplate: "USPS_SmallFlatRateBox"
}

const build = (p = parcel, box = ordinary) =>
  buildVerifiedShippoParcel({
    parcel: p,
    packaging: box
  })

test("ordinary parcel retains dimensions and weight", () => {
  assert.deepEqual(build(), parcel)
})

test("verified Flat Rate parcel uses Shippo template", () => {
  assert.deepEqual(build(parcel, flatRate), {
    template: "USPS_SmallFlatRateBox",
    weight: "23",
    mass_unit: "oz"
  })
})

test("Flat Rate parcel omits ordinary dimensions", () => {
  const result = build(parcel, flatRate)

  for (const key of [
    "length",
    "width",
    "height",
    "distance_unit"
  ]) {
    assert.equal(key in result, false)
  }
})

test("unknown Flat Rate template fails closed", () => {
  assert.throws(
    () => build(parcel, {
      ...flatRate,
      shippoParcelTemplate: "USPS_FlatRateBox"
    }),
    /Unverified USPS/
  )
})

test("non-USPS Flat Rate carrier fails closed", () => {
  assert.throws(
    () => build(parcel, {
      ...flatRate,
      carrier: "UPS"
    }),
    /Unverified USPS/
  )
})

test("ordinary package cannot smuggle a template", () => {
  assert.throws(
    () => build(parcel, {
      ...ordinary,
      shippoParcelTemplate: "USPS_SmallFlatRateBox"
    }),
    /cannot use carrier template/
  )
})

test("missing packaging classification fails closed", () => {
  assert.throws(
    () => build(parcel, {}),
    /classification missing/
  )
})

test("missing or invalid weight fails closed", () => {
  for (const weight of ["", "0", "-1", "NaN", "2401"]) {
    assert.throws(
      () => build({ ...parcel, weight }),
      /Invalid verified parcel weight/
    )
  }
})

test("wrong mass unit fails closed", () => {
  assert.throws(
    () => build({ ...parcel, mass_unit: "lb" }),
    /Invalid verified parcel weight/
  )
})

test("ordinary parcel requires valid dimensions", () => {
  for (const length of ["", "0", "-2", "121"]) {
    assert.throws(
      () => build({ ...parcel, length }),
      /Invalid parcel dimensions/
    )
  }
})

test("invalid parcel structure fails closed", () => {
  assert.throws(
    () => buildVerifiedShippoParcel({
      parcel: null,
      packaging: flatRate
    }),
    /Verified parcel/
  )
})