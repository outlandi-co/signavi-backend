import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)

const launcher = path.join(
  root,
  "scripts/executeSmartShippingV3FreshSandbox.mjs"
)

// Disable every payment-creation gate in child processes.
// These tests exercise only the argument rejection boundary.
const env = {
  ...process.env,
  NODE_ENV: "test",
  SQUARE_ENVIRONMENT: "sandbox",
  SMART_SHIPPING_V3_ENABLED: "false",
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "false",
  SIGNAVI_V3_SANDBOX_ONE_SHOT_APPROVAL: ""
}

const cases = [
  ["missing arguments", [], "fresh_sandbox_order_required"],
  ["malformed order ID", ["--execute", "invalid"], "fresh_sandbox_order_required"],
  [
    "protected original order",
    ["--execute", "6add930c3b60c62003d103a6"],
    "fresh_sandbox_order_required"
  ],
  [
    "protected historical error order",
    ["--execute", "6add74398f0468ad2c712f5c"],
    "fresh_sandbox_order_required"
  ],
  [
    "protected preserved fixture",
    ["--execute", "6addb0c222fc25ed65b4555f"],
    "fresh_sandbox_order_required"
  ]
]

for (const [name, args, expected] of cases) {
  const result = spawnSync(
    process.execPath,
    [launcher, ...args],
    {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true
    }
  )

  assert.equal(result.error, undefined)
  assert.notEqual(result.status, 0, `${name}: unexpectedly succeeded`)

  const output = `${result.stdout}\n${result.stderr}`
  assert.ok(
    output.includes(expected),
    `${name}: expected rejection missing`
  )

  console.log(`${name.toUpperCase()}: PASS`)
}

console.log("FRESH LAUNCHER NEGATIVE GUARDS: PASS")
console.log("NO DATABASE CONNECTIONS EXPECTED")
console.log("NO SQUARE CREATION ENABLED")