import test from "node:test"
import assert from "node:assert/strict"
import { simulateProductAwarePacking } from "./mockProductAwarePacking.mjs"

const shirt = {
  productType: "physical",
  shippingClass: "tshirt",
  shipping: {
    weightOz: 6,
    compatibilityMode: "combine",
    shipSeparately: false
  }
}

function testSandbox(callback) {
  const previousMode = process.env.NODE_ENV
  const previousFlag = process.env.SIGNAVI_MOCK_SHIPPING
  process.env.NODE_ENV = "test"
  process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

  try {
    callback()
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousMode

    if (previousFlag === undefined) delete process.env.SIGNAVI_MOCK_SHIPPING
    else process.env.SIGNAVI_MOCK_SHIPPING = previousFlag
  }
}

test("one shirt uses saved weight", () => testSandbox(() => {
  const result = simulateProductAwarePacking(shirt, 1)
  assert.equal(result.totalShipmentWeightOz, 6.5)
  assert.equal(result.parcels[0].packageId, "mock-poly-small")
}))

test("four shirts switch to a box", () => testSandbox(() => {
  const result = simulateProductAwarePacking(shirt, 4)
  assert.equal(result.parcels[0].packageId, "mock-box-small")
  assert.equal(result.totalShipmentWeightOz, 32)
}))

test("different saved shirt weight changes totals", () => testSandbox(() => {
  const result = simulateProductAwarePacking({
    ...shirt,
    shipping: { ...shirt.shipping, weightOz: 8 }
  }, 3)

  assert.equal(result.totalShipmentWeightOz, 25)
}))

test("unclassified items fail closed", () => testSandbox(() => {
  const result = simulateProductAwarePacking({
    ...shirt,
    shippingClass: undefined
  }, 5)

  assert.equal(result.requiresManualReview, true)
  assert.equal(result.parcels.length, 0)
}))

test("protected keytags need separate mock implementation", () => testSandbox(() => {
  const result = simulateProductAwarePacking({
    productType: "physical",
    shippingClass: "protected",
    shipping: {
      weightOz: 0.5,
      compatibilityMode: "protected",
      requiresProtection: true
    }
  }, 30)

  assert.equal(result.requiresManualReview, true)
  assert.equal(result.checkoutEligible, false)
}))

test("separate oversized canopies are never packed as shirts", () => testSandbox(() => {
  const result = simulateProductAwarePacking({
    productType: "physical",
    shippingClass: "oversized",
    shipping: {
      weightOz: 100,
      compatibilityMode: "separate",
      shipSeparately: true,
      oversized: true
    }
  }, 1)

  assert.equal(result.parcels.length, 0)
  assert.equal(result.requiresManualReview, true)
}))

test("production execution is rejected", () => {
  const previousMode = process.env.NODE_ENV
  const previousFlag = process.env.SIGNAVI_MOCK_SHIPPING
  process.env.NODE_ENV = "production"
  process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

  try {
    assert.throws(
      () => simulateProductAwarePacking(shirt, 1),
      /SANDBOX_ONLY/
    )
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousMode

    if (previousFlag === undefined) delete process.env.SIGNAVI_MOCK_SHIPPING
    else process.env.SIGNAVI_MOCK_SHIPPING = previousFlag
  }
})

test("invalid capacity never bypasses validation", () => testSandbox(() => {
  assert.throws(
    () => simulateProductAwarePacking({
      ...shirt,
      shipping: {
        ...shirt.shipping,
        maxUnitsPerPackage: 2.5
      }
    }, 3),
    /INVALID_PACKAGE_CAPACITY/
  )
}))

test("mock results cannot activate checkout", () => testSandbox(() => {
  const result = simulateProductAwarePacking(shirt, 10)
  assert.equal(result.checkoutEligible, false)
  assert.equal(result.productionRatesAllowed, false)
  assert.ok(result.parcels.every(p => p.carrierEligible === false))
}))

test("large orders cannot exceed product capacity", () => testSandbox(() => {
  const result = simulateProductAwarePacking({
    ...shirt,
    shipping: {
      ...shirt.shipping,
      maxUnitsPerPackage: 3
    }
  }, 10)

  assert.equal(result.requiresManualReview, true)
  assert.equal(result.reason, "PRODUCT_CAPACITY_RULE_NOT_IMPLEMENTED")
  assert.deepEqual(result.parcels, [])
  assert.equal(result.checkoutEligible, false)
}))

test("matching capacity allows mock packing", () => testSandbox(() => {
  const result = simulateProductAwarePacking({
    ...shirt,
    shipping: {
      ...shirt.shipping,
      maxUnitsPerPackage: 6
    }
  }, 4)

  assert.equal(result.requiresManualReview, false)
  assert.equal(result.parcels[0].quantity, 4)
  assert.equal(result.checkoutEligible, false)
}))
