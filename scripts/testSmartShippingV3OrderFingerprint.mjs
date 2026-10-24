import assert from "node:assert/strict"
import { createV3OrderFingerprint } from "../utils/smartShippingV3OrderFingerprint.js"

const order = {
  _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  customerName: "Test Customer",
  items: [{
    productId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    quantity: 2,
    finalPrice: 19.99,
    variant: {
      color: "black",
      size: "L"
    }
  }],
  address: {
    street: "123 Example Street",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  }
}

const clone = () => structuredClone(order)
const original = createV3OrderFingerprint(order)

assert.match(original, /^[a-f0-9]{64}$/)
assert.equal(createV3OrderFingerprint(clone()), original)

console.log("VALID SAVED ORDER: PASS")
console.log("STABLE ORDER FINGERPRINT: PASS")

const changes = [
  ["ORDER ID", o => {
    o._id = "cccccccccccccccccccccccc"
  }],
  ["PRODUCT", o => {
    o.items[0].productId = "dddddddddddddddddddddddd"
  }],
  ["QUANTITY", o => {
    o.items[0].quantity = 3
  }],
  ["PRICE", o => {
    o.items[0].finalPrice = 9.99
  }],
  ["COLOR", o => {
    o.items[0].variant.color = "red"
  }],
  ["SIZE", o => {
    o.items[0].variant.size = "XL"
  }],
  ["SHIPPING STREET", o => {
    o.address.street = "456 Example Street"
  }],
  ["ZIP CODE", o => {
    o.address.zip = "95341"
  }]
]

for (const [name, change] of changes) {
  const changed = clone()
  change(changed)

  assert.notEqual(
    createV3OrderFingerprint(changed),
    original,
    `${name} modification was not detected`
  )

  console.log(`${name} CHANGE: PASS (detected)`)
}

const invalidOrder = clone()
invalidOrder._id = "invalid"

assert.throws(() =>
  createV3OrderFingerprint(invalidOrder)
)

console.log("INVALID ORDER ID: PASS (rejected)")

const missingAddress = clone()
missingAddress.address.street = ""

assert.throws(() =>
  createV3OrderFingerprint(missingAddress)
)

console.log("MISSING SHIPPING STREET: PASS (rejected)")

console.log("ALL V3 ORDER FINGERPRINT TESTS PASSED")