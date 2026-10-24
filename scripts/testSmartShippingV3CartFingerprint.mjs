import assert from "node:assert/strict"
import { createV3CartFingerprint } from "../utils/smartShippingV3CartFingerprint.js"

const cart = {
  items: [
    {
      productId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      quantity: 2,
      finalPrice: 19.99,
      variant: { color: "black", size: "L" }
    },
    {
      productId: "bbbbbbbbbbbbbbbbbbbbbbbb",
      quantity: 1,
      finalPrice: 24.99,
      variant: { color: "navy", size: "XL" }
    }
  ],
  address: {
    name: "Test Customer",
    street1: "123 Example Street",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  }
}

const clone = () => structuredClone(cart)
const original = createV3CartFingerprint(cart)

assert.match(original, /^[a-f0-9]{64}$/)

console.log("VALID CART FINGERPRINT: PASS")

const reordered = clone()
reordered.items.reverse()

assert.equal(
  createV3CartFingerprint(reordered),
  original
)

console.log("ITEM ORDER INDEPENDENCE: PASS")

const mutations = [
  ["PRODUCT ID", c => {
    c.items[0].productId = "cccccccccccccccccccccccc"
  }],
  ["QUANTITY", c => {
    c.items[0].quantity = 3
  }],
  ["PRICE", c => {
    c.items[0].finalPrice = 9.99
  }],
  ["COLOR", c => {
    c.items[0].variant.color = "red"
  }],
  ["SIZE", c => {
    c.items[0].variant.size = "XXL"
  }],
  ["STREET ADDRESS", c => {
    c.address.street1 = "456 Example Street"
  }],
  ["ZIP CODE", c => {
    c.address.zip = "95341"
  }],
  ["COUNTRY", c => {
    c.address.country = "CA"
  }]
]

for (const [name, change] of mutations) {
  const modified = clone()
  change(modified)

  assert.notEqual(
    createV3CartFingerprint(modified),
    original,
    `${name} modification was not detected`
  )

  console.log(`${name} CHANGE: PASS (detected)`)
}

const invalidQuantity = clone()
invalidQuantity.items[0].quantity = 0

assert.throws(() =>
  createV3CartFingerprint(invalidQuantity)
)

console.log("INVALID QUANTITY: PASS (rejected)")

const invalidPrice = clone()
invalidPrice.items[0].finalPrice = -1

assert.throws(() =>
  createV3CartFingerprint(invalidPrice)
)

console.log("INVALID PRICE: PASS (rejected)")

const missingAddress = clone()
missingAddress.address.zip = ""

assert.throws(() =>
  createV3CartFingerprint(missingAddress)
)

console.log("INCOMPLETE ADDRESS: PASS (rejected)")

console.log("ALL V3 CART FINGERPRINT TESTS PASSED")