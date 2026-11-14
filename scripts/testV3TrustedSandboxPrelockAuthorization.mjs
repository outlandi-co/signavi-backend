import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"

import {
  assertV3TrustedSandboxFirstPaymentAuthorization
} from "../utils/assertV3TrustedSandboxFirstPaymentAuthorization.js"

const source = readFileSync(
  new URL("../utils/v3TrustedSandboxCheckoutHandoff.js", import.meta.url),
  "utf8"
)

test("checkout entry requires authority before acquiring lock", () => {
  const entry = source.indexOf(
    "export async function executeV3TrustedSandboxCheckout("
  )

  assert.ok(entry >= 0)

  const body = source.slice(entry)

  const guard = body.indexOf(
    "assertV3TrustedSandboxFirstPaymentAuthorization()"
  )

  const lock = body.indexOf(
    "const lock = await acquireV3IsolatedCheckoutLock("
  )

  assert.ok(guard >= 0)
  assert.ok(lock > guard)
})

test("missing authority cannot permit lock acquisition", () => {
  assert.throws(
    () => assertV3TrustedSandboxFirstPaymentAuthorization(),
    /V3_TRUSTED_FIRST_PAYMENT_AUTHORIZATION_NOT_CONNECTED/
  )
})

test("client-supplied authorization cannot bypass guard", () => {
  assert.throws(
    () => assertV3TrustedSandboxFirstPaymentAuthorization({
      authorized: true,
      orderId: "507f1f77bcf86cd799439011",
      squareRequestAuthorized: true
    }),
    /V3_TRUSTED_FIRST_PAYMENT_AUTHORIZATION_NOT_CONNECTED/
  )
})
