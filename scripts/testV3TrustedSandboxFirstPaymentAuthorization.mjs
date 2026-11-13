import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"

import {
  assertV3TrustedSandboxFirstPaymentAuthorization
} from "../utils/assertV3TrustedSandboxFirstPaymentAuthorization.js"

const reason =
  /V3_TRUSTED_FIRST_PAYMENT_AUTHORIZATION_NOT_CONNECTED/

test("missing trusted authority fails closed", () => {
  assert.throws(
    () => assertV3TrustedSandboxFirstPaymentAuthorization(),
    reason
  )
})

test("forged caller authority cannot unlock creation", () => {
  assert.throws(
    () => assertV3TrustedSandboxFirstPaymentAuthorization({
      authorized: true,
      squareRequestAuthorized: true,
      authoritativeNoPriorActivity: true
    }),
    reason
  )
})

test("trusted execution invokes guard before SDK construction", () => {
  const source = readFileSync(
    new URL("../utils/smartShippingV3TrustedExecution.js", import.meta.url),
    "utf8"
  )

  const guardCall =
    source.indexOf("  assertV3TrustedSandboxFirstPaymentAuthorization()")
  const sdkConstruction =
    source.indexOf("  const sdk = sdkFactory()")
  const workflowCall =
    source.indexOf("  const result = await runV3SandboxExecutionWorkflow(")

  assert.ok(guardCall >= 0)
  assert.ok(sdkConstruction > guardCall)
  assert.ok(workflowCall > sdkConstruction)
})
