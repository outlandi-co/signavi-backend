import assert from "node:assert/strict"
import test from "node:test"

import PaymentOperation from
  "../models/SmartShippingV3PaymentOperation.js"

const schema = PaymentOperation.schema
const field = schema.path("squareIdempotencyKey")

test("Square request identity field exists", () => {
  assert.ok(field)
  assert.equal(field.instance, "String")
})

test("Square request identity defaults to null", () => {
  const document = new PaymentOperation()
  assert.equal(document.squareIdempotencyKey, null)
})

test("Square request identity is immutable", () => {
  assert.equal(field.options.immutable, false)
})

test("valid Square request identity accepted", () => {
  const key = `sv3p-${"a".repeat(40)}`
  const document = new PaymentOperation({
    squareIdempotencyKey: key
  })

  assert.equal(document.squareIdempotencyKey, key)

  const error = document.validateSync()
  assert.equal(
    error?.errors?.squareIdempotencyKey,
    undefined
  )
})

test("invalid Square request identity rejected", () => {
  for (const key of [
    "invalid",
    "signavi-v3-sandbox-test",
    `sv3p-${"x".repeat(40)}`,
    `sv3p-${"a".repeat(41)}`
  ]) {
    const document = new PaymentOperation({
      squareIdempotencyKey: key
    })

    const error = document.validateSync()

    assert.ok(
      error?.errors?.squareIdempotencyKey,
      `Expected validation failure for ${key}`
    )
  }
})

test("existing purchase identity remains separate", () => {
  assert.ok(schema.path("idempotencyKey"))
  assert.ok(schema.path("squareCreationAttemptClaimedAt"))

  assert.notEqual(
    schema.path("idempotencyKey"),
    schema.path("squareIdempotencyKey")
  )
})

test("schema change does not authorize execution", () => {
  assert.equal(
    schema.path("squareIdempotencyKey")
      .options.default,
    null
  )

  assert.equal(
    typeof PaymentOperation.checkoutExecutor,
    "undefined"
  )
})