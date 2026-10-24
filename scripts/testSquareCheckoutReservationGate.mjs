import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const source = readFileSync(
  new URL("../routes/square.js", import.meta.url),
  "utf8"
)

const start = source.indexOf(
  "    // Dedicated database-backed integration test gate."
)

const end = source.indexOf(
  "    // Block legacy Square creation",
  start
)

assert.ok(start >= 0, "Integration gate missing")
assert.ok(end > start, "Legacy guard missing after gate")

const gate = source.slice(start, end)

const evaluate = async ({
  environment = "test",
  flag = "true",
  database = "signavi_reservation_isolated_test",
  prepared = true, claimApproved = true
} = {}) => {
  let calls = 0
  let statusCode = null
  let response = null

  const result = await runInNewContext(
    `(async function () {
      ${gate}
      return undefined
    })()`,
    {
      process: {
        env: {
          NODE_ENV: environment,
          SQUARE_RESERVATION_INTEGRATION_TEST: flag
        }
      },
      mongoose: {
        connection: {
          db: { databaseName: database }
        }
      },
      prepareSquarePaymentCreation: async () => {
        calls++
        return prepared
          ? { prepared: true }
          : {
              prepared: false,
              reason: "payment_creation_already_reserved"
            }
      },
      claimSquarePaymentCreationAttempt: async () => ({ claimed: claimApproved }),
      record: { _id: "synthetic-order-id" },
      squareMode: "sandbox",
      cents: 100,
      res: {
        status(code) {
          statusCode = code
          return this
        },
        json(value) {
          response = value
          return value
        }
      }
    },
    { timeout: 1000 }
  )

  return { calls, statusCode, response, result }
}

const first = await evaluate()

assert.equal(first.calls, 1)
assert.equal(first.statusCode, 423)
assert.equal(first.response.squareRequestAuthorized, false)
assert.equal(
  first.response.reason,
  "square_execution_not_authorized"
)

console.log("RESERVATION ACCEPTED: SQUARE BLOCKED")

const duplicate = await evaluate({ prepared: false })

assert.equal(duplicate.calls, 1)
assert.equal(duplicate.statusCode, 423)
assert.equal(
  duplicate.response.reason,
  "payment_creation_already_reserved"
)

console.log("DUPLICATE RESERVATION: BLOCKED")

for (const options of [
  { environment: "production" },
  { flag: "false" },
  { database: "signavi_shipping_v3_dev" }
]) {
  const result = await evaluate(options)

  assert.equal(result.calls, 0)
  assert.equal(result.statusCode, null)
}

console.log("NON-TEST CONFIGURATIONS: GATE INACTIVE")
console.log("NO DATABASE OR SQUARE REQUESTS")
console.log("CHECKOUT RESERVATION GATE TEST PASSED")