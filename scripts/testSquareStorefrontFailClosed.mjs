import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const source = readFileSync(
  new URL("../routes/square.js", import.meta.url),
  "utf8"
)

const start = source.indexOf(
  "    // Smart Shipping V3 storefront safety boundary."
)

const end = source.indexOf(
  "    const response =",
  start
)

assert.ok(start >= 0, "Storefront guard missing")
assert.ok(end > start, "Square creation boundary missing")

const guard = source.slice(start, end)

assert.ok(
  guard.includes("return res.status(423).json("),
  "Expected HTTP 423 response"
)

assert.ok(
  !guard.includes("process.env."),
  "Environment variables must not bypass guard"
)

for (const mode of ["test", "development", "production"]) {
  let statusCode = null
  let responseBody = null
  let squareCalls = 0

  const response = {
    status(code) {
      statusCode = code
      return this
    },
    json(body) {
      responseBody = body
      return body
    }
  }

  await runInNewContext(
    `(async () => {
      ${guard}
      return "unexpected"
    })()`,
    {
      process: { env: { NODE_ENV: mode } },
      res: response,
      client: {
        checkout: {
          paymentLinks: {
            create: async () => {
              squareCalls++
            }
          }
        }
      }
    },
    { timeout: 1000 }
  )

  assert.equal(statusCode, 423)
  assert.equal(
    responseBody.reason,
    "payment_execution_not_authorized"
  )
  assert.equal(responseBody.squareRequestAuthorized, false)
  assert.equal(squareCalls, 0)

  console.log(`${mode.toUpperCase()}: BLOCKED`)
}

console.log("NO CONFIGURATION BYPASS")
console.log("NO DATABASE OR SQUARE REQUESTS")
console.log("STOREFRONT FAIL-CLOSED GUARD TEST PASSED")