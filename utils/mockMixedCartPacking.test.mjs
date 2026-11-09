import test from "node:test"
import assert from "node:assert/strict"
import { simulateMixedCartPacking } from "./mockMixedCartPacking.mjs"

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

function sandbox(fn) {
  const oldMode = process.env.NODE_ENV
  const oldFlag = process.env.SIGNAVI_MOCK_SHIPPING
  process.env.NODE_ENV = "test"
  process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

  try {
    fn()
  } finally {
    if (oldMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = oldMode

    if (oldFlag === undefined) delete process.env.SIGNAVI_MOCK_SHIPPING
    else process.env.SIGNAVI_MOCK_SHIPPING = oldFlag
  }
}

test("five shirts use the mock small box", () => sandbox(() => {
  const result = simulateMixedCartPacking([
    { product: shirt, quantity: 5 }
  ])

  assert.equal(result.parcels[0].packageId, "mock-box-small")
  assert.equal(result.totalProductWeightOz, 30)
  assert.equal(result.completeShipmentWeightOz, 38)
  assert.equal(result.checkoutEligible, false)
}))

test("mixed cart accounts for all unit weights", () => sandbox(() => {
  const result = simulateMixedCartPacking([
    { product: shirt, quantity: 5 },
    { product: keytag, quantity: 30 },
    { product: canopy, quantity: 1 }
  ])

  assert.equal(result.totalQuantity, 36)
  assert.equal(result.totalProductWeightOz, 145)
  assert.equal(result.simulatedParcelCount, 1)
  assert.equal(result.simulatedParcelWeightOz, 38)
  assert.equal(result.completeShipmentWeightOz, null)
  assert.equal(result.reviewItems.length, 2)
  assert.equal(result.requiresManualReview, true)
}))

test("protected products cannot enter shirt parcels", () => sandbox(() => {
  const result = simulateMixedCartPacking([
    { product: shirt, quantity: 3 },
    { product: keytag, quantity: 30 }
  ])

  assert.ok(result.parcels.every(p => p.productId === "shirt"))
  assert.equal(result.reviewItems[0].productId, "keytag")
}))

test("oversized products require review", () => sandbox(() => {
  const result = simulateMixedCartPacking([
    { product: canopy, quantity: 1 }
  ])

  assert.equal(result.parcels.length, 0)
  assert.equal(result.reviewItems.length, 1)
  assert.equal(result.completeShipmentWeightOz, null)
}))

test("respects lower product capacity limits", () => sandbox(() => {
  const limited = {
    ...shirt,
    shipping: {
      ...shirt.shipping,
      maxUnitsPerPackage: 3
    }
  }

  const result = simulateMixedCartPacking([
    { product: limited, quantity: 10 }
  ])

  assert.equal(result.requiresManualReview, true)
  assert.equal(result.parcels.length, 0)
}))

test("rejects duplicate product entries", () => sandbox(() => {
  assert.throws(() => simulateMixedCartPacking([
    { product: shirt, quantity: 1 },
    { product: shirt, quantity: 2 }
  ]), /DUPLICATE_PRODUCT_ID/)
}))

test("rejects invalid unit weights", () => sandbox(() => {
  assert.throws(() => simulateMixedCartPacking([
    {
      product: {
        ...shirt,
        shipping: { ...shirt.shipping, weightOz: 0 }
      },
      quantity: 1
    }
  ]), /INVALID_PRODUCT_UNIT_WEIGHT/)
}))

test("rejects orders over 200 total units", () => sandbox(() => {
  assert.throws(() => simulateMixedCartPacking([
    { product: shirt, quantity: 200 },
    { product: canopy, quantity: 1 }
  ]), /MOCK_CART_UNIT_LIMIT/)
}))

test("production mode fails closed", () => {
  const previous = process.env.NODE_ENV
  const flag = process.env.SIGNAVI_MOCK_SHIPPING

  process.env.NODE_ENV = "production"
  process.env.SIGNAVI_MOCK_SHIPPING = "enabled"

  try {
    assert.throws(() => simulateMixedCartPacking([
      { product: shirt, quantity: 1 }
    ]), /SANDBOX_ONLY/)
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous

    if (flag === undefined) delete process.env.SIGNAVI_MOCK_SHIPPING
    else process.env.SIGNAVI_MOCK_SHIPPING = flag
  }
})

test("mock shipping is never checkout eligible", () => sandbox(() => {
  const result = simulateMixedCartPacking([
    { product: shirt, quantity: 10 }
  ])

  assert.equal(result.checkoutEligible, false)
  assert.equal(result.productionRatesAllowed, false)
  assert.equal(result.carrierEligible, false)
  assert.equal(result.mixedItemCoPackingVerified, false)
  assert.ok(result.parcels.every(p => p.carrierEligible === false))
}))
