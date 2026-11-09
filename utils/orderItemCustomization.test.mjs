import test from "node:test"
import assert from "node:assert/strict"

import {
  normalizeOrderItemCustomization as normalize
} from "./orderItemCustomization.js"

const custom = {
  artwork: "https://example.com/artwork/flower.png",
  productionType: "screenprint",
  printLocation: "front",
  design: { x: 150, y: 150, size: 120 }
}

test("ordinary catalog items have no customization", () => {
  assert.equal(normalize(undefined), undefined)
  assert.equal(normalize(null), undefined)
})

test("preserves valid production details", () => {
  assert.deepEqual(normalize(custom), custom)
})

test("rejects unsupported fields", () => {
  assert.throws(
    () => normalize({ ...custom, price: 0.01 }),
    /Unsupported customization field/
  )
})

test("rejects unsafe artwork URLs", () => {
  assert.throws(
    () => normalize({ ...custom, artwork: "javascript:alert(1)" }),
    /Artwork requires an HTTPS URL/
  )
})

test("rejects invalid design coordinates", () => {
  assert.throws(
    () => normalize({
      ...custom,
      design: { x: "bad", y: 150, size: 120 }
    }),
    /Invalid customization design x/
  )
})

test("rejects incomplete production options", () => {
  assert.throws(
    () => normalize({ ...custom, productionType: "" }),
    /Incomplete customization options/
  )
})
