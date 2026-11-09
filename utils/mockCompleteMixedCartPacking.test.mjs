
import test from "node:test"
import assert from "node:assert/strict"
import { simulateCompleteMixedCartPacking } from "./mockCompleteMixedCartPacking.mjs"

const shirt = {
  id: "shirt",
  productType: "physical",
  shippingClass: "tshirt",
  shipping: {
    weightOz: 6,
    compatibilityMode: "combine",
    shipSeparately: false
  }
}

const keytag = {
  id: "keytag",
  productType: "physical",
  shippingClass: "protected",
  shipping: {
    weightOz: 0.5,
    compatibilityMode: "protected",
    requiresProtection: true
  }
}

const canopy = {
  id: "canopy",
  productType: "physical",
  shippingClass: "oversized",
  shipping: {
    weightOz: 100,
    compatibilityMode: "separate",
    shipSeparately: true,
    oversized: true,
    maxUnitsPerPackage: 1
  }
}

const cart = [
  { product: shirt, quantity: 5 },
  { product: keytag, quantity: 30 },
  { product: canopy, quantity: 1 }
]

function sandbox(callback) {
  const oldMode = process.env.NODE_ENV
  const oldFlag = process.env.SIGNAVI_MOCK_SHIPPING

  process.env.NODE_ENV = "test"
  process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

  try {
    callback()
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = oldMode

    if (oldFlag === undefined) delete process.env.SIGNAVI_MOCK_SHIPPING
    else process.env.SIGNAVI_MOCK_SHIPPING = oldFlag
  }
}

test("5 shirts, 30 keytags, 1 canopy produce four hypothetical parcels", () => sandbox(() => {
  const result = simulateCompleteMixedCartPacking(cart)

  assert.equal(result.totalQuantity, 36)
  assert.equal(result.totalProductWeightOz, 145)
  assert.equal(result.hypotheticalParcelCount, 4)
  assert.equal(result.hypotheticalTotalPackedWeightOz, 193)
  assert.deepEqual(
    result.hypotheticalParcels.map(p => p.packageId),
    [
      "mock-box-small",
      "mock-protective-box",
      "mock-protective-box",
      "mock-oversized-carton"
    ]
  )
}))

test("specialty packing still requires review", () => sandbox(() => {
  const result = simulateCompleteMixedCartPacking(cart)

  assert.equal(result.requiresManualReview, true)
  assert.equal(result.completeShipmentWeightOz, null)
  assert.equal(result.checkoutEligible, false)
  assert.equal(result.productionRatesAllowed, false)
}))

test("protected and oversized products stay in distinct parcels", () => sandbox(() => {
  const result = simulateCompleteMixedCartPacking(cart)

  assert.equal(
    result.hypotheticalParcels.filter(p => p.productId === "keytag").length,
    2
  )

  assert.equal(
    result.hypotheticalParcels.filter(p => p.productId === "canopy").length,
    1
  )
}))

test("unclassified product prevents complete hypothetical total", () => sandbox(() => {
  const unknown = {
    ...shirt,
    id: "unknown",
    shippingClass: undefined
  }

  const result = simulateCompleteMixedCartPacking([
    { product: shirt, quantity: 2 },
    { product: unknown, quantity: 1 }
  ])

  assert.equal(result.hypotheticalTotalPackedWeightOz, null)
  assert.equal(result.unresolvedItems.length, 1)
  assert.equal(result.hypotheticalPackagingComplete, false)
}))

test("shirt-only simulation retains its hypothetical weight", () => sandbox(() => {
  const result = simulateCompleteMixedCartPacking([
    { product: shirt, quantity: 5 }
  ])

  assert.equal(result.hypotheticalTotalPackedWeightOz, 38)
  assert.equal(result.hypotheticalParcelCount, 1)
  assert.equal(result.checkoutEligible, false)
}))

test("all parcels remain unverified and carrier-ineligible", () => sandbox(() => {
  const result = simulateCompleteMixedCartPacking(cart)

  assert.ok(result.hypotheticalParcels.every(p =>
    p.mock === true &&
    p.verified === false &&
    p.carrierEligible === false
  ))
}))

test("production mode cannot execute simulation", () => {
  const oldMode = process.env.NODE_ENV
  const oldFlag = process.env.SIGNAVI_MOCK_SHIPPING

  process.env.NODE_ENV = "production"
  process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

  try {
    assert.throws(
      () => simulateCompleteMixedCartPacking(cart),
      /SANDBOX_ONLY/
    )
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = oldMode

    if (oldFlag === undefined) delete process.env.SIGNAVI_MOCK_SHIPPING
    else process.env.SIGNAVI_MOCK_SHIPPING = oldFlag
  }
})
