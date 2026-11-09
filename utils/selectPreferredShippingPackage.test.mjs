import test from "node:test"
import assert from "node:assert/strict"
import {
  selectPreferredShippingPackage as select
} from "./selectPreferredShippingPackage.mjs"

const smallId = "507f1f77bcf86cd799439011"
const largeId = "507f1f77bcf86cd799439012"

const small = {
  box: { id: smallId, type: "mailer" },
  perParcel: 1,
  parcelCount: 5
}

const large = {
  box: { id: largeId, type: "box" },
  perParcel: 8,
  parcelCount: 1
}

const packages = [small.box, large.box]

function pick(mode, quantity, candidates = [large, small], id = smallId) {
  return select({
    candidates,
    packages,
    productShipping: { mode, packageId: id },
    quantity
  })
}

test("one item uses preferred small package", () => {
  assert.equal(pick("saved_package", 1), small)
})

test("five items upgrade to suitable larger package", () => {
  assert.equal(pick("saved_package", 5), large)
})

test("manual product mode uses automatic ranking", () => {
  assert.equal(pick("product_measurements", 5), large)
})

test("legacy products use automatic ranking", () => {
  assert.equal(
    select({
      candidates: [large, small],
      packages,
      productShipping: {},
      quantity: 5
    }),
    large
  )
})

test("per-order mode cannot auto-quote", () => {
  assert.equal(pick("per_order", 1), null)
})

test("unknown shipping mode fails closed", () => {
  assert.equal(pick("unknown", 1), null)
})

test("invalid preferred ID fails closed", () => {
  assert.equal(pick("saved_package", 1, [large], "invalid"), null)
})

test("inactive or deleted preferred package fails closed", () => {
  assert.equal(
    pick("saved_package", 5, [large], "507f1f77bcf86cd799439099"),
    null
  )
})

test("valid preferred package can fall back if it cannot fit", () => {
  assert.equal(pick("saved_package", 5, [large]), large)
})

test("no suitable packages means no shipping quote", () => {
  assert.equal(pick("saved_package", 5, []), null)
})
