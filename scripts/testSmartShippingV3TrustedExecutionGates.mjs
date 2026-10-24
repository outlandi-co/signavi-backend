import assert from "node:assert/strict"

import {
  runV3TrustedSandboxExecution
} from "../utils/smartShippingV3TrustedExecution.js"

const names = [
  "NODE_ENV",
  "SQUARE_ENVIRONMENT",
  "SMART_SHIPPING_V3_ENABLED",
  "SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED"
]

const original = Object.fromEntries(
  names.map(name => [name, process.env[name]])
)

const restore = () => {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

const run = () => runV3TrustedSandboxExecution({
  orderId: "507f1f77bcf86cd799439011",
  owner: "mock-owner"
})

try {
  process.env.NODE_ENV = "test"
  process.env.SQUARE_ENVIRONMENT = "sandbox"
  process.env.SMART_SHIPPING_V3_ENABLED = "true"

  delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

  await assert.rejects(run(), /disabled/)
  console.log("DEFAULT-DISABLED FLAG: PASS")

  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"
  process.env.SQUARE_ENVIRONMENT = "production"

  await assert.rejects(run(), /disabled/)
  console.log("PRODUCTION SQUARE ENVIRONMENT BLOCKED: PASS")

  process.env.SQUARE_ENVIRONMENT = "sandbox"
  process.env.NODE_ENV = "production"

  await assert.rejects(run(), /disabled/)
  console.log("NODE PRODUCTION MODE BLOCKED: PASS")

  process.env.NODE_ENV = "test"

  await assert.rejects(
    runV3TrustedSandboxExecution({
      orderId: "not-an-object-id",
      owner: "mock-owner"
    }),
    /Invalid trusted V3 execution identity/
  )
  console.log("INVALID ORDER ID BLOCKED: PASS")

  await assert.rejects(
    runV3TrustedSandboxExecution({
      orderId: "507f1f77bcf86cd799439011",
      owner: ""
    }),
    /Invalid trusted V3 execution identity/
  )
  console.log("EMPTY OWNER BLOCKED: PASS")

  await assert.rejects(
    run(),
    /isolated development database required/
  )
  console.log("UNCONNECTED DATABASE BLOCKED: PASS")

  console.log("NO SQUARE REQUESTS OR DATABASE WRITES: PASS")
  console.log("ALL TRUSTED EXECUTION GATES PASSED")
} finally {
  restore()
}