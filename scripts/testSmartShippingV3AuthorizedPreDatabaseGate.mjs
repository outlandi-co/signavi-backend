import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

const orderId = "6add930c3b60c62003d103a6"
const launcher = "scripts/executeSmartShippingV3OneShotSandbox.mjs"

const env = {
  ...process.env,
  NODE_ENV: "test",
  SQUARE_ENVIRONMENT: "sandbox",
  SIGNAVI_V3_SANDBOX_ONE_SHOT_APPROVAL: orderId,
  SMART_SHIPPING_V3_ENABLED: "true",
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "true",
  MONGO_URI: "",
  SQUARE_SANDBOX_ACCESS_TOKEN: "",
  SQUARE_SANDBOX_MERCHANT_ID: "",
  SQUARE_SANDBOX_LOCATION_ID: "",
  SQUARE_ACCESS_TOKEN: "",
  NODE_OPTIONS: ""
}

const result = spawnSync(
  process.execPath,
  [launcher, "--execute", orderId],
  {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 10000
  }
)

assert.equal(result.error, undefined)
assert.notEqual(result.status, 0)

const output = `${result.stdout}\n${result.stderr}`

assert.ok(
  output.includes("ONE-SHOT SANDBOX STOPPED: database_not_configured")
)

assert.ok(!output.includes("SANDBOX PAYMENT LINK VERIFIED"))
assert.ok(!output.includes("INSPECT PERSISTED STATE"))

console.log("AUTHORIZED PRE-DATABASE GATE: PASS")
console.log("MISSING DATABASE FAILS CLOSED: PASS")
console.log("NO COORDINATION STARTED: PASS")
console.log("NO MONGODB CONNECTION: PASS")
console.log("NO REAL SQUARE REQUESTS: PASS")