import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  denyV3ProductionCheckout
} from "../utils/denyV3ProductionCheckout.js"

test("production V3 checkout fails closed", () => {
  const gate = denyV3ProductionCheckout()

  assert.equal(gate.httpStatus, 423)
  assert.equal(gate.body.success, false)
  assert.equal(gate.body.paymentCreated, false)
  assert.equal(gate.body.squareRequestAuthorized, false)
  assert.equal(gate.body.retryAuthorized, false)
})

test("activation cannot be enabled by request arguments", () => {
  const gate = denyV3ProductionCheckout({
    authorized: true,
    productionEnabled: true,
    squareRequestAuthorized: true
  })

  assert.equal(gate.httpStatus, 423)
  assert.equal(gate.body.squareRequestAuthorized, false)
})

test("activation result is immutable", () => {
  const gate = denyV3ProductionCheckout()

  assert.equal(Object.isFrozen(gate), true)
  assert.equal(Object.isFrozen(gate.body), true)
})

test("orders route uses the production-disabled adapter", () => {
  const source = readFileSync(
    new URL("../routes/orders.js", import.meta.url),
    "utf8"
  )

  assert.match(
    source,
    /denyV3ProductionCheckout\(\)/
  )

  assert.match(
    source,
    /V3_PREVIEW_ONLY/
  )

  assert.match(
    source,
    /verifyGuestCheckoutToken\(order,\s*guestToken\)/
  )
})

test("legacy Square route retains HTTP 423 protection", () => {
  const source = readFileSync(
    new URL("../routes/square.js", import.meta.url),
    "utf8"
  )

  assert.match(
    source,
    /payment_execution_not_authorized/
  )
})