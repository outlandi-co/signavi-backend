
import test from "node:test"
import assert from "node:assert/strict"
import { simulateShirtPackaging } from "./mockStorefrontPackaging.mjs"

function simulate(quantity) {
  return simulateShirtPackaging({
    quantity,
    unitWeightOz: 6
  })
}

test("fails closed when sandbox flag is missing", () => {
  const previous = process.env.SIGNAVI_MOCK_SHIPPING
  delete process.env.SIGNAVI_MOCK_SHIPPING

  try {
    assert.throws(() => simulate(1), /SANDBOX_ONLY/)
  } finally {
    if (previous === undefined) {
      delete process.env.SIGNAVI_MOCK_SHIPPING
    } else {
      process.env.SIGNAVI_MOCK_SHIPPING = previous
    }
  }
})

test("never runs in production", () => {
  const previous = process.env.NODE_ENV
  process.env.NODE_ENV = "production"

  try {
    assert.throws(() => simulate(1), /SANDBOX_ONLY/)
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
})

process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

test("one shirt uses small mock poly mailer", () => {
  const result = simulate(1)
  assert.equal(result.parcels[0].packageId, "mock-poly-small")
  assert.equal(result.totalShipmentWeightOz, 6.5)
})

test("three shirts use large mock poly mailer", () => {
  const result = simulate(3)
  assert.equal(result.parcels[0].packageId, "mock-poly-large")
  assert.equal(result.totalShipmentWeightOz, 19)
})

test("four shirts switch to a mock box", () => {
  const result = simulate(4)
  assert.equal(result.parcels[0].packageId, "mock-box-small")
  assert.equal(result.totalShipmentWeightOz, 32)
})

test("ten shirts use medium mock box", () => {
  const result = simulate(10)
  assert.equal(result.parcels[0].packageId, "mock-box-medium")
  assert.equal(result.totalShipmentWeightOz, 72)
})

test("25 shirts use multiple mock boxes", () => {
  const result = simulate(25)
  assert.equal(result.packageCount, 2)
  assert.deepEqual(
    result.parcels.map(parcel => parcel.packageId),
    ["mock-box-large", "mock-box-small"]
  )
  assert.equal(result.totalShipmentWeightOz, 178)
})

test("rejects invalid quantities and weights", () => {
  assert.throws(() => simulate(0), /INVALID_SHIRT_QUANTITY/)
  assert.throws(() => simulate(1.5), /INVALID_SHIRT_QUANTITY/)
  assert.throws(() => simulateShirtPackaging({
    quantity: 1,
    unitWeightOz: 0
  }), /INVALID_UNIT_WEIGHT/)
})

test("never marks mock parcels as carrier eligible", () => {
  const result = simulate(25)
  assert.equal(result.checkoutEligible, false)
  assert.equal(result.productionRatesAllowed, false)
  assert.ok(result.parcels.every(parcel =>
    parcel.mock === true &&
    parcel.verified === false &&
    parcel.carrierEligible === false
  ))
})
