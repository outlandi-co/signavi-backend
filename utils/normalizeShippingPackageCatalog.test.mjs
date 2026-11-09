import test from "node:test"
import assert from "node:assert/strict"
import {
  normalizeShippingPackage,
  normalizeShippingPackageCatalog
} from "./normalizeShippingPackageCatalog.mjs"

const sample = {
  carrier: "USPS",
  _id: "507f1f77bcf86cd799439011",
  name: "Verified Test Box",
  type: "box",
  lengthIn: 16,
  widthIn: 12,
  heightIn: 6,
  tareWeightOz: 4,
  maxWeightOz: 64,
  clearanceIn: 0.5,
  uspsFlatRate: true,
  shippoParcelTemplate: "USPS_SmallFlatRateBox",
  verifiedShirtCapacity: 5,
  active: true
}

test("maps saved package fields into packing format", () => {
  const result = normalizeShippingPackage(sample)

  assert.equal(result.id, sample._id)
  assert.equal(result.type, "box")
  assert.equal(result.length, 16)
  assert.equal(result.width, 12)
  assert.equal(result.height, 6)
  assert.equal(result.tare, 4)
  assert.equal(result.maxWeight, 64)
  assert.equal(result.clearance, 0.5)
})

test("rejects inactive packages", () => {
  assert.equal(
    normalizeShippingPackage({ ...sample, active: false }),
    null
  )
})

test("rejects unknown package types", () => {
  assert.equal(
    normalizeShippingPackage({ ...sample, type: "unknown" }),
    null
  )
})

test("rejects nonpositive dimensions", () => {
  assert.equal(
    normalizeShippingPackage({ ...sample, heightIn: 0 }),
    null
  )
})

test("rejects packages without available weight capacity", () => {
  assert.equal(
    normalizeShippingPackage({
      ...sample,
      tareWeightOz: 64,
      maxWeightOz: 64
    }),
    null
  )
})

test("rejects impossible clearance", () => {
  assert.equal(
    normalizeShippingPackage({ ...sample, clearanceIn: 6 }),
    null
  )
})

test("rejects missing required weight limits", () => {
  assert.equal(
    normalizeShippingPackage({
      ...sample,
      maxWeightOz: undefined
    }),
    null
  )
})

test("filters invalid records from the package catalog", () => {
  const result = normalizeShippingPackageCatalog([
    sample,
    { ...sample, active: false },
    { ...sample, lengthIn: -1 }
  ])

  assert.equal(result.length, 1)
  assert.equal(result[0].name, "Verified Test Box")
})

test("does not invent packages when input is unavailable", () => {
  assert.deepEqual(normalizeShippingPackageCatalog(null), [])
  assert.deepEqual(normalizeShippingPackageCatalog([]), [])
})

test("preserves carrier template and Flat Rate metadata", () => {
  const result = normalizeShippingPackage(sample)

  assert.equal(result.uspsFlatRate, true)
  assert.equal(result.shippoParcelTemplate, "USPS_SmallFlatRateBox")
  assert.equal(result.verifiedShirtCapacity, 5)
})

test("legacy packages have safe metadata defaults", () => {
  const {
    uspsFlatRate,
    shippoParcelTemplate,
    verifiedShirtCapacity,
    ...legacy
  } = sample

  const result = normalizeShippingPackage(legacy)

  assert.equal(result.uspsFlatRate, false)
  assert.equal(result.shippoParcelTemplate, "")
  assert.equal(result.verifiedShirtCapacity, null)
})

test("invalid verified shirt capacity is rejected", () => {
  for (const value of [0, -1, 1.5, "5", true]) {
    assert.equal(
      normalizeShippingPackage({
        ...sample,
        verifiedShirtCapacity: value
      }),
      null
    )
  }
})

test("carrier size and weight limits are enforced", () => {
  assert.equal(
    normalizeShippingPackage({
      ...sample,
      lengthIn: 121
    }),
    null
  )

  assert.equal(
    normalizeShippingPackage({
      ...sample,
      maxWeightOz: 2401
    }),
    null
  )
})

test("Flat Rate metadata does not create an assumed weight", () => {
  const result = normalizeShippingPackage(sample)

  assert.ok(result)
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      "packedWeightOz"
    ),
    false
  )
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result,
      "unitWeightOz"
    ),
    false
  )
})


test("USPS Flat Rate preserves verified carrier identity", () => {
  const result = normalizeShippingPackage(sample)
  assert.ok(result)
  assert.equal(result.carrier, "USPS")
  assert.equal(result.uspsFlatRate, true)
  assert.equal(result.shippoParcelTemplate, "USPS_SmallFlatRateBox")
})

test("unsupported USPS Flat Rate templates fail closed", () => {
  const result = normalizeShippingPackage({
    ...sample,
    shippoParcelTemplate: "USPS_FlatRateBox"
  })
  assert.equal(result, null)
})

test("Flat Rate packages require USPS as carrier", () => {
  for (const carrier of ["UPS", "FedEx", "", undefined]) {
    assert.equal(
      normalizeShippingPackage({ ...sample, carrier }),
      null
    )
  }
})

test("Flat Rate packages require supported templates", () => {
  for (const template of ["", "UnknownTemplate", 123, null]) {
    assert.equal(
      normalizeShippingPackage({
        ...sample,
        shippoParcelTemplate: template
      }),
      null
    )
  }
})

test("ordinary dimension packaging rejects carrier templates", () => {
  assert.equal(
    normalizeShippingPackage({
      ...sample,
      uspsFlatRate: false
    }),
    null
  )

  const ordinary = normalizeShippingPackage({
    ...sample,
    uspsFlatRate: false,
    shippoParcelTemplate: ""
  })

  assert.ok(ordinary)
  assert.equal(ordinary.carrier, "USPS")
})

test("invalid Flat Rate flag fails closed", () => {
  assert.equal(
    normalizeShippingPackage({
      ...sample,
      uspsFlatRate: "true"
    }),
    null
  )
})
