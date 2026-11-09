import test from "node:test"
import assert from "node:assert/strict"
import { simulateSpecialtyPackaging } from "./mockSpecialtyPackaging.mjs"

function simulate(type, quantity, shipping = {}) {
  return simulateSpecialtyPackaging({
    shippingClass: type,
    quantity,
    unitWeightOz: type === "protected" ? 0.5 : 100,
    shipping: type === "protected"
      ? {
          compatibilityMode: "protected",
          requiresProtection: true,
          ...shipping
        }
      : {
          compatibilityMode: "separate",
          shipSeparately: true,
          oversized: true,
          ...shipping
        }
  })
}

function sandbox(fn) {
  const previousMode = process.env.NODE_ENV
  const previousFlag = process.env.SIGNAVI_MOCK_SHIPPING

  process.env.NODE_ENV = "test"
  process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

  try {
    fn()
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousMode

    if (previousFlag === undefined) delete process.env.SIGNAVI_MOCK_SHIPPING
    else process.env.SIGNAVI_MOCK_SHIPPING = previousFlag
  }
}

test("30 keytags use two hypothetical protective boxes", () => sandbox(() => {
  const result = simulate("protected", 30)
  assert.equal(result.parcels.length, 2)
  assert.deepEqual(result.parcels.map(p => p.quantity), [25, 5])
  assert.equal(result.hypotheticalPackedWeightOz, 23)
}))

test("one canopy uses its own oversized carton", () => sandbox(() => {
  const result = simulate("oversized", 1)
  assert.equal(result.parcels.length, 1)
  assert.equal(result.parcels[0].totalWeightOz, 132)
}))

test("two canopies cannot share one carton", () => sandbox(() => {
  const result = simulate("oversized", 2)
  assert.deepEqual(result.parcels.map(p => p.quantity), [1, 1])
}))

test("smaller product capacity is enforced", () => sandbox(() => {
  const result = simulate("protected", 6, {
    maxUnitsPerPackage: 2
  })
  assert.deepEqual(result.parcels.map(p => p.quantity), [2, 2, 2])
}))

test("missing protective requirement fails closed", () => sandbox(() => {
  assert.throws(
    () => simulate("protected", 5, { requiresProtection: false }),
    /INCONSISTENT/
  )
}))

test("oversized products must ship separately", () => sandbox(() => {
  assert.throws(
    () => simulate("oversized", 1, { shipSeparately: false }),
    /INCONSISTENT/
  )
}))

test("rejects invalid capacity", () => sandbox(() => {
  assert.throws(
    () => simulate("protected", 5, { maxUnitsPerPackage: 0 }),
    /INVALID_PACKAGE_CAPACITY/
  )
}))

test("rejects unsupported classes", () => sandbox(() => {
  assert.throws(
    () => simulate("tshirt", 2),
    /UNSUPPORTED_SPECIALTY_CLASS/
  )
}))

test("production use is blocked", () => {
  const previousMode = process.env.NODE_ENV
  const previousFlag = process.env.SIGNAVI_MOCK_SHIPPING

  process.env.NODE_ENV = "production"
  process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

  try {
    assert.throws(
      () => simulate("protected", 5),
      /SANDBOX_ONLY/
    )
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousMode

    if (previousFlag === undefined) delete process.env.SIGNAVI_MOCK_SHIPPING
    else process.env.SIGNAVI_MOCK_SHIPPING = previousFlag
  }
})

test("mock parcels never become checkout eligible", () => sandbox(() => {
  const result = simulate("protected", 30)
  assert.equal(result.requiresManualReview, true)
  assert.equal(result.checkoutEligible, false)
  assert.equal(result.productionRatesAllowed, false)
  assert.ok(result.parcels.every(p => (
    p.mock === true &&
    p.verified === false &&
    p.carrierEligible === false
  )))
}))