import test from "node:test"
import assert from "node:assert/strict"
import {
  buildVerifiedSavedPackageParcels
} from "./buildVerifiedSavedPackageParcels.mjs"

const productId = "507f1f77bcf86cd799439011"
const packageId = "507f1f77bcf86cd799439012"

const box = {
  id: packageId,
  length: 12,
  width: 10,
  height: 4,
  tare: 2,
  maxWeight: 50,
  uspsFlatRate: true,
  shippoParcelTemplate: "USPS_FlatRateBox"
}

const profile = {
  productId,
  packageId,
  unitWeightOz: 7,
  verifiedCapacity: 3,
  verifiedBy: "Fulfillment administrator",
  verifiedAt: new Date("2026-11-01T12:00:00Z"),
  verificationNotes: "Measured and verified by fulfillment.",
  active: true
}

const calculate = (changes = {}) =>
  buildVerifiedSavedPackageParcels({
    productId,
    selectedPackageId: packageId,
    quantity: 1,
    packages: [box],
    profiles: [profile],
    ...changes
  })

test("one shirt uses verified weight plus tare", () => {
  const result = calculate()
  assert.equal(result.error, undefined)
  assert.equal(result.parcels.length, 1)
  assert.equal(result.parcels[0].weight, "9")
})

test("five shirts require two verified parcels", () => {
  const result = calculate({ quantity: 5 })
  assert.equal(result.error, undefined)
  assert.equal(result.parcels.length, 2)
  assert.deepEqual(
    result.parcels.map((parcel) => parcel.weight),
    ["23", "16"]
  )
})

test("verified capacity limits the number of shirts", () => {
  const result = calculate({
    profiles: [{ ...profile, verifiedCapacity: 1 }],
    quantity: 2
  })
  assert.equal(result.parcels.length, 2)
})

test("package weight limit restricts quantity per parcel", () => {
  const result = calculate({
    packages: [{ ...box, maxWeight: 16 }],
    quantity: 3
  })
  assert.equal(result.error, undefined)
  assert.deepEqual(
    result.parcels.map((parcel) => parcel.weight),
    ["16", "9"]
  )
})

test("missing verified profiles fail closed", () => {
  assert.ok(calculate({ profiles: [] }).error)
})

test("inactive profiles fail closed", () => {
  assert.ok(calculate({
    profiles: [{ ...profile, active: false }]
  }).error)
})

test("duplicate active profiles fail closed", () => {
  assert.ok(calculate({
    profiles: [profile, { ...profile }]
  }).error)
})

test("zero or missing unit weight fails closed", () => {
  for (const weight of [0, null, undefined, NaN]) {
    assert.ok(calculate({
      profiles: [{ ...profile, unitWeightOz: weight }]
    }).error)
  }
})

test("fractional or missing capacity fails closed", () => {
  for (const capacity of [0, 1.5, null, undefined]) {
    assert.ok(calculate({
      profiles: [{ ...profile, verifiedCapacity: capacity }]
    }).error)
  }
})

test("missing verification evidence fails closed", () => {
  assert.ok(calculate({
    profiles: [{ ...profile, verifiedBy: "" }]
  }).error)
  assert.ok(calculate({
    profiles: [{ ...profile, verificationNotes: "" }]
  }).error)
  assert.ok(calculate({
    profiles: [{ ...profile, verifiedAt: null }]
  }).error)
})

test("missing package fails closed", () => {
  assert.ok(calculate({ packages: [] }).error)
})

test("overweight product fails closed", () => {
  assert.ok(calculate({
    profiles: [{ ...profile, unitWeightOz: 60 }]
  }).error)
})

test("too many parcels fails closed", () => {
  assert.ok(calculate({
    profiles: [{ ...profile, verifiedCapacity: 1 }],
    quantity: 11
  }).error)
})

test("invalid quantity fails closed", () => {
  for (const quantity of [0, 1.5, 201, "5"]) {
    assert.ok(calculate({ quantity }).error)
  }
})

test("Flat Rate status does not create an assumed rate", () => {
  const result = calculate()
  assert.equal(result.uspsFlatRate, true)
  assert.equal(result.shippoParcelTemplate, "USPS_FlatRateBox")
  assert.equal(
    Object.hasOwn(result, "shippingPrice"),
    false
  )
})