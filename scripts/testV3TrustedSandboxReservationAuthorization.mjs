import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"

const source = readFileSync(
  new URL("../utils/v3TrustedSandboxCheckoutHandoff.js", import.meta.url),
  "utf8"
)

test("first-payment guard precedes durable reservation", () => {
  const guard = source.indexOf(
    "  assertV3TrustedSandboxFirstPaymentAuthorization()"
  )

  const reservation = source.indexOf(
    "  const reservation ="
  )

  const execution = source.indexOf(
    "  return runV3TrustedSandboxExecution({"
  )

  assert.ok(guard >= 0)
  assert.ok(reservation > guard)
  assert.ok(execution > reservation)
})

test("reservation authorization is fail closed", async () => {
  const {
    assertV3TrustedSandboxFirstPaymentAuthorization
  } = await import(
    "../utils/assertV3TrustedSandboxFirstPaymentAuthorization.js"
  )

  assert.throws(
    () => assertV3TrustedSandboxFirstPaymentAuthorization(),
    /V3_TRUSTED_FIRST_PAYMENT_AUTHORIZATION_NOT_CONNECTED/
  )
})
