import test from "node:test"
import assert from "node:assert/strict"
import {
  SHIPPING_MODES,
  resolveShippingMode,
  validateShippingSelection
} from "./productShippingMode.mjs"

const measurements = {
  weightOz: 8,
  lengthIn: 12,
  widthIn: 10,
  heightIn: 2
}

const id = "507f1f77bcf86cd799439011"

test("legacy shipping defaults to product measurements", () => {
  assert.equal(
    resolveShippingMode(undefined),
    SHIPPING_MODES.PRODUCT
  )
})

test("unknown shipping modes fail closed", () => {
  assert.equal(resolveShippingMode("anything"), null)
})

test("product measurements are accepted", () => {
  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.PRODUCT,
      ...measurements
    }).valid,
    true
  )
})

test("saved package requires valid package ID", () => {
  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.SAVED,
      ...measurements,
      packageId: id
    }).valid,
    true
  )

  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.SAVED,
      ...measurements,
      packageId: "invalid"
    }).valid,
    false
  )
})

test("saved packages do not require manual dimensions", () => {
  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.SAVED,
      packageId: id
    }).valid,
    true
  )
})

test("saved packages still reject missing IDs", () => {
  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.SAVED
    }).valid,
    false
  )
})

test("per-order packaging does not require preset dimensions", () => {
  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.ORDER
    }).valid,
    true
  )
})

test("per-order packaging cannot retain a package ID", () => {
  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.ORDER,
      packageId: id
    }).valid,
    false
  )
})

test("zero and missing measurements are rejected", () => {
  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.PRODUCT,
      ...measurements,
      weightOz: 0
    }).valid,
    false
  )

  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.PRODUCT,
      ...measurements,
      heightIn: ""
    }).valid,
    false
  )
})

test("numeric booleans are rejected", () => {
  assert.equal(
    validateShippingSelection({
      mode: SHIPPING_MODES.PRODUCT,
      ...measurements,
      weightOz: true
    }).valid,
    false
  )
})