import assert from "node:assert/strict"

import {
  calculateCatalogCart
} from "../utils/catalogPricing.js"

import {
  projectNormalizedStorefrontOrder,
  fingerprintNormalizedStorefrontOrder
} from "../utils/storefrontNormalizedFingerprint.mjs"

const productId = "507f1f77bcf86cd799439011"

const product = {
  _id: productId,
  name: "Test Shirt",
  storefront: "signavi_store",
  active: true,
  storefrontVisible: true,
  productType: "physical",
  stock: 100,
  variants: [
    { color: "Blue", size: "Large", price: 20, stock: 100 },
    { color: "Red", size: "Large", price: 22, stock: 100 }
  ]
}

const customer = {
  customerName: " Test Customer ",
  email: " CUSTOMER@EXAMPLE.TEST ",
  phone: " 5550000000 ",
  address: {
    street: " 123 Example Street ",
    city: " Example ",
    state: "CA",
    zip: "90000"
  }
}

const cartA = calculateCatalogCart(
  [product],
  [{
    productId,
    quantity: "2",
    selectedVariant: {
      color: " BLUE ",
      size: "large",
      price: 1
    },
    price: 1,
    finalPrice: 1
  }]
)

const cartB = calculateCatalogCart(
  [product],
  [{
    productId,
    quantity: 2,
    variant: {
      color: "blue",
      size: "LARGE"
    }
  }]
)

const first = fingerprintNormalizedStorefrontOrder(
  customer,
  cartA.items
)

const second = fingerprintNormalizedStorefrontOrder(
  {
    ...customer,
    email: "customer@example.test",
    customerName: "Test Customer",
    phone: "5550000000",
    address: {
      country: "US",
      zip: "90000",
      state: "CA",
      city: "Example",
      street: "123 Example Street",
      ignoredBrowserField: "not persisted"
    }
  },
  cartB.items
)

assert.equal(first, second)

console.log("PASS: Equivalent catalog selections produce one fingerprint")

const projection = projectNormalizedStorefrontOrder(
  customer,
  cartA.items
)

assert.equal(projection.address.country, "US")
assert.equal(projection.items[0].quantity, 2)
assert.equal(projection.items[0].selectedVariant.color, "blue")
assert.equal(projection.items[0].selectedVariant.size, "large")

assert.equal("price" in projection.items[0], false)
assert.equal("stock" in projection.items[0], false)

console.log("PASS: Stored customer fields and variants normalized")

const repricedProduct = {
  ...product,
  variants: [
    { color: "Blue", size: "Large", price: 30, stock: 100 },
    { color: "Red", size: "Large", price: 35, stock: 100 }
  ]
}

const repricedCart = calculateCatalogCart(
  [repricedProduct],
  [{
    productId,
    quantity: 2,
    selectedVariant: { color: "blue", size: "large" }
  }]
)

assert.equal(
  fingerprintNormalizedStorefrontOrder(
    customer,
    repricedCart.items
  ),
  first
)

console.log("PASS: Catalog price changes do not change attempt identity")

const differentQuantity = calculateCatalogCart(
  [product],
  [{
    productId,
    quantity: 3,
    selectedVariant: { color: "blue", size: "large" }
  }]
)

assert.notEqual(
  fingerprintNormalizedStorefrontOrder(
    customer,
    differentQuantity.items
  ),
  first
)

console.log("PASS: Changed quantity changes fingerprint")

const differentVariant = calculateCatalogCart(
  [product],
  [{
    productId,
    quantity: 2,
    selectedVariant: { color: "red", size: "large" }
  }]
)

assert.notEqual(
  fingerprintNormalizedStorefrontOrder(
    customer,
    differentVariant.items
  ),
  first
)

console.log("PASS: Changed selected variant changes fingerprint")

assert.notEqual(
  fingerprintNormalizedStorefrontOrder(
    {
      ...customer,
      address: { ...customer.address, zip: "90001" }
    },
    cartA.items
  ),
  first
)

assert.notEqual(
  fingerprintNormalizedStorefrontOrder(
    { ...customer, email: "other@example.test" },
    cartA.items
  ),
  first
)

console.log("PASS: Changed address or customer changes fingerprint")

assert.throws(
  () => projectNormalizedStorefrontOrder(
    customer,
    [{ productId: "invalid", quantity: 1 }]
  ),
  /Invalid validated catalog item/
)

console.log("PASS: Invalid catalog identity is rejected")