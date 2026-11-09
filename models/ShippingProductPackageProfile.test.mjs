import test from "node:test"
import assert from "node:assert/strict"
import Profile from "./ShippingProductPackageProfile.js"

const sample = {
  productId: "507f1f77bcf86cd799439011",
  packageId: "507f1f77bcf86cd799439012",
  unitWeightOz: 7,
  verifiedCapacity: 3,
  verifiedBy: "Fulfillment administrator",
  verifiedAt: new Date("2026-11-01T12:00:00Z"),
  verificationNotes: "Measured on calibrated shipping scale.",
  active: true
}

test("accepts measured product/package profile", () => {
  const doc = new Profile(sample)
  assert.equal(doc.validateSync(), undefined)
  assert.equal(doc.unitWeightOz, 7)
  assert.equal(doc.verifiedCapacity, 3)
})

test("inactive is the default until verification is approved", () => {
  const doc = new Profile({ ...sample, active: undefined })
  assert.equal(doc.active, false)
})

test("missing measured weight is rejected", () => {
  const doc = new Profile({
    ...sample,
    unitWeightOz: undefined
  })
  assert.ok(doc.validateSync())
})

test("zero weight is rejected", () => {
  const doc = new Profile({ ...sample, unitWeightOz: 0 })
  assert.ok(doc.validateSync())
})

test("fractional capacity is rejected", () => {
  const doc = new Profile({
    ...sample,
    verifiedCapacity: 1.5
  })
  assert.ok(doc.validateSync())
})

test("missing verification evidence is rejected", () => {
  const doc = new Profile({
    ...sample,
    verificationNotes: undefined
  })
  assert.ok(doc.validateSync())
})

test("missing verification date is rejected", () => {
  const doc = new Profile({
    ...sample,
    verifiedAt: undefined
  })
  assert.ok(doc.validateSync())
})

test("missing product or package is rejected", () => {
  for (const key of ["productId", "packageId"]) {
    const doc = new Profile({
      ...sample,
      [key]: undefined
    })
    assert.ok(doc.validateSync())
  }
})

test("one profile is uniquely indexed per product and package", () => {
  const indexes = Profile.schema.indexes()
  assert.ok(indexes.some(([fields, options]) =>
    fields.productId === 1 &&
    fields.packageId === 1 &&
    options.unique === true
  ))
})
