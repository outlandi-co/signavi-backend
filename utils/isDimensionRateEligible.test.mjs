import test from "node:test"
import assert from "node:assert/strict"
import {
  isDimensionRateEligible
} from "./isDimensionRateEligible.mjs"

const regularBox = {
  id: "507f1f77bcf86cd799439011",
  uspsFlatRate: false,
  shippoParcelTemplate: ""
}

test("ordinary validated packaging is eligible", () => {
  assert.equal(isDimensionRateEligible(regularBox), true)
})

test("USPS Flat Rate packaging is excluded", () => {
  assert.equal(
    isDimensionRateEligible({
      ...regularBox,
      uspsFlatRate: true,
      shippoParcelTemplate: "USPS_SmallFlatRateBox"
    }),
    false
  )
})

test("carrier-template packaging is excluded", () => {
  assert.equal(
    isDimensionRateEligible({
      ...regularBox,
      shippoParcelTemplate: "USPS_MediumFlatRateBox1"
    }),
    false
  )
})

test("missing eligibility metadata fails closed", () => {
  for (const box of [
    {},
    null,
    undefined,
    [],
    { uspsFlatRate: false },
    { shippoParcelTemplate: "" },
    { uspsFlatRate: null, shippoParcelTemplate: "" }
  ]) {
    assert.equal(isDimensionRateEligible(box), false)
  }
})

test("invalid template metadata fails closed", () => {
  for (const template of [null, false, 123, {}]) {
    assert.equal(
      isDimensionRateEligible({
        ...regularBox,
        shippoParcelTemplate: template
      }),
      false
    )
  }
})
