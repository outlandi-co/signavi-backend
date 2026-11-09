import test from "node:test"
import assert from "node:assert/strict"
import {
  validateShippingPackageAdminChange as validate
} from "./validateShippingPackageAdminChange.mjs"

const sample = () => ({
  name: "Verified test package",
  carrier: "Generic",
  type: "box",
  lengthIn: 12,
  widthIn: 10,
  heightIn: 4,
  tareWeightOz: 2,
  maxWeightOz: 64,
  clearanceIn: 0,
  uspsFlatRate: false,
  shippoParcelTemplate: "",
  active: true
})

test("valid active ordinary package passes", () => {
  assert.equal(validate({ changes: sample() }), true)
})

test("valid partial update uses existing package", () => {
  assert.equal(validate({
    existing: sample(),
    changes: { name: "Updated package" }
  }), true)
})

test("zero dimensions cannot be activated", () => {
  assert.equal(validate({
    changes: { ...sample(), lengthIn: 0 }
  }), false)
})

test("weight capacity must exceed tare", () => {
  assert.equal(validate({
    changes: { ...sample(), maxWeightOz: 2 }
  }), false)
})

test("ordinary packages cannot claim carrier templates", () => {
  assert.equal(validate({
    changes: {
      ...sample(),
      shippoParcelTemplate: "USPS_SmallFlatRateBox"
    }
  }), false)
})

test("incomplete active packages fail", () => {
  assert.equal(validate({
    changes: { name: "Incomplete", active: true }
  }), false)
})

test("inactive incomplete drafts are permitted", () => {
  assert.equal(validate({
    changes: { name: "Draft", active: false }
  }), true)
})

test("invalid draft cannot be activated", () => {
  assert.equal(validate({
    existing: {
      name: "Draft",
      active: false,
      type: "box"
    },
    changes: { active: true }
  }), false)
})

test("invalid active field fails", () => {
  assert.equal(validate({
    changes: { ...sample(), active: "true" }
  }), false)
})

test("missing and malformed inputs fail", () => {
  assert.equal(validate(), false)
  assert.equal(validate({ changes: null }), false)
  assert.equal(validate({ changes: [] }), false)
})