import assert from "node:assert/strict"

import {
  projectPreCatalogStorefrontOrder,
  fingerprintPreCatalogStorefrontOrder
} from "../utils/storefrontPreCatalogFingerprint.mjs"

import {
  fingerprintNormalizedStorefrontOrder
} from "../utils/storefrontNormalizedFingerprint.mjs"

import {
  calculateCatalogCart
} from "../utils/catalogPricing.js"

const ID = "507f1f77bcf86cd799439011"

const request = {
  email: " CUSTOMER@example.com ",
  customerName: "Alex Buyer",
  phone: " 555-0100 ",
  address: {
    street: "123 Main St",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: ID,
    quantity: 2,
    selectedVariant: {
      color: " Blue ",
      size: " LARGE "
    }
  }]
}

const projection = projectPreCatalogStorefrontOrder(request)
const original = fingerprintPreCatalogStorefrontOrder(request)

assert.match(original, /^[a-f0-9]{64}$/)
assert.equal(projection.items[0].selectedVariant.color, "blue")
assert.equal(projection.items[0].selectedVariant.size, "large")

console.log("PASS: Raw purchase selection normalized before catalog lookup")

const equivalent = {
  ...request,
  email: "customer@example.com",
  phone: "555-0100",
  items: [{
    id: ID.toUpperCase(),
    quantity: "2",
    variant: {
      color: "blue",
      size: "large"
    }
  }]
}

assert.equal(
  fingerprintPreCatalogStorefrontOrder(equivalent),
  original
)

console.log("PASS: Equivalent identifiers and variant aliases agree")

const product = {
  _id: ID,
  storefront: "signavi_store",
  active: true,
  storefrontVisible: true,
  productType: "physical",
  name: "Sample Shirt",
  variants: [{
    color: "Blue",
    size: "Large",
    price: 18,
    stock: 30
  }]
}

const catalog = calculateCatalogCart([product], request.items)

assert.equal(
  fingerprintNormalizedStorefrontOrder(
    request,
    catalog.items
  ),
  original
)

console.log("PASS: Raw and validated-catalog fingerprints agree")

const changedPrice = {
  ...product,
  variants: [{
    color: "Blue",
    size: "Large",
    price: 27,
    stock: 30
  }]
}

const repriced = calculateCatalogCart(
  [changedPrice],
  request.items
)

assert.equal(
  fingerprintNormalizedStorefrontOrder(
    request,
    repriced.items
  ),
  original
)

console.log("PASS: Database price changes do not change identity")

assert.throws(
  () => calculateCatalogCart(
    [{ ...product, variants: [] , stock: 0 }],
    request.items
  )
)

assert.equal(
  fingerprintPreCatalogStorefrontOrder(request),
  original
)

console.log("PASS: Existing request identity survives catalog unavailability")

for (const items of [
  [{ productId: "invalid", quantity: 1 }],
  [{ productId: ID, quantity: 0 }],
  [{ productId: ID, quantity: 501 }],
  [{ productId: ID, quantity: 1.5 }],
  [{ productId: ID, selectedVariant: { color: "Blue" } }]
]) {
  assert.throws(
    () => fingerprintPreCatalogStorefrontOrder({
      ...request,
      items
    })
  )
}

console.log("PASS: Invalid IDs, quantities and partial variants rejected")

assert.notEqual(
  fingerprintPreCatalogStorefrontOrder({
    ...request,
    items: [{ ...request.items[0], quantity: 3 }]
  }),
  original
)

assert.notEqual(
  fingerprintPreCatalogStorefrontOrder({
    ...request,
    address: { ...request.address, zip: "95341" }
  }),
  original
)

console.log("PASS: Changed quantity and address produce different identity")