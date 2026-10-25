import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

const target = "6add930c3b60c62003d103a6"
const launcher = "scripts/executeSmartShippingV3OneShotSandbox.mjs"

const safeEnv = {
  ...process.env,
  NODE_ENV: "test",
  SQUARE_ENVIRONMENT: "sandbox",
  SMART_SHIPPING_V3_ENABLED: "false",
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "false",
  SIGNAVI_V3_SANDBOX_ONE_SHOT_APPROVAL: "",
  MONGO_URI: "",
  SQUARE_SANDBOX_ACCESS_TOKEN: "",
  SQUARE_SANDBOX_MERCHANT_ID: "",
  SQUARE_SANDBOX_LOCATION_ID: "",
  NODE_OPTIONS: ""
}

const cases = [
  {
    name: "MISSING ARGUMENTS",
    args: [],
    expected: "invalid_arguments"
  },
  {
    name: "WRONG ORDER BLOCKED",
    args: ["--execute", "6add74398f0468ad2c712f5c"],
    expected: "invalid_arguments"
  },
  {
    name: "EXACT ORDER WITHOUT APPROVAL",
    args: ["--execute", target],
    expected: "approval_missing"
  },
  {
    name: "FLAGS DISABLED",
    args: ["--execute", target],
    env: {
      SIGNAVI_V3_SANDBOX_ONE_SHOT_APPROVAL: target
    },
    expected: "feature_flags_disabled"
  },
  {
    name: "PRODUCTION MODE BLOCKED",
    args: ["--execute", target],
    env: {
      NODE_ENV: "production"
    },
    expected: "environment_blocked"
  },
  {
    name: "PRODUCTION SQUARE BLOCKED",
    args: ["--execute", target],
    env: {
      SQUARE_ENVIRONMENT: "production"
    },
    expected: "environment_blocked"
  }
]

for (const test of cases) {
  const result = spawnSync(
    process.execPath,
    [launcher, ...test.args],
    {
      cwd: process.cwd(),
      env: { ...safeEnv, ...test.env },
      encoding: "utf8",
      timeout: 10000
    }
  )

  assert.equal(result.error, undefined, `${test.name}: spawn error`)
  assert.notEqual(result.status, 0, `${test.name}: unexpectedly succeeded`)

  const output = `${result.stdout}\n${result.stderr}`

  assert.ok(
    output.includes(`ONE-SHOT SANDBOX STOPPED: ${test.expected}`),
    `${test.name}: unexpected rejection`
  )

  assert.ok(
    !output.includes("SANDBOX PAYMENT LINK VERIFIED"),
    `${test.name}: unexpectedly reached payment success`
  )

  console.log(`${test.name}: PASS`)
}

console.log("ALL SIX LAUNCHER GUARD TESTS PASSED")
console.log("NO MONGODB CONNECTION CONFIGURED")
console.log("NO REAL SQUARE NETWORK REQUESTS")