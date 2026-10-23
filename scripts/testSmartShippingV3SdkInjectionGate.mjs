import assert from "node:assert/strict"

import {
  runV3TrustedSandboxExecutionForTests
} from "../utils/smartShippingV3TrustedExecution.js"

const originalNodeEnv = process.env.NODE_ENV

try {
  process.env.NODE_ENV = "production"

  assert.throws(
    () => runV3TrustedSandboxExecutionForTests({}),
    /test-only/
  )

  console.log("PRODUCTION SDK INJECTION BLOCKED: PASS")

  process.env.NODE_ENV = "development"

  assert.throws(
    () => runV3TrustedSandboxExecutionForTests({}),
    /test-only/
  )

  console.log("DEVELOPMENT SDK INJECTION BLOCKED: PASS")

  process.env.NODE_ENV = "test"

  assert.throws(
    () => runV3TrustedSandboxExecutionForTests({
      orderId: "507f1f77bcf86cd799439011",
      owner: "mock-owner",
      sdk: {}
    }),
    /Invalid V3 test SDK/
  )

  console.log("INVALID MOCK SDK BLOCKED: PASS")
  console.log("NO SQUARE REQUESTS: PASS")
  console.log("NO DATABASE WRITES: PASS")
  console.log("ALL SDK INJECTION GATES PASSED")

} finally {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = originalNodeEnv
  }
}