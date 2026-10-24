import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const source = readFileSync(
  new URL("../controllers/invoiceController.js", import.meta.url),
  "utf8"
)

const start = source.indexOf(
  "  // Smart Shipping V3 safety gate."
)

const end = source.indexOf(
  "  const response =",
  start
)

assert.ok(start >= 0, "Invoice safety guard missing")
assert.ok(end > start, "Square creation boundary missing")

const guard = source.slice(start, end)

assert.ok(
  guard.includes("throw Object.assign("),
  "Guard must reject execution"
)

assert.ok(
  !guard.includes("process.env."),
  "Configuration must not bypass the guard"
)

for (const mode of ["test", "development", "production"]) {
  let squareCalls = 0
  let rejection = null

  try {
    await runInNewContext(
      `(async () => {
        ${guard}
        return "unexpected success"
      })()`,
      {
        process: { env: { NODE_ENV: mode } },
        squareClient: {
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
  } catch (error) {
    rejection = error
  }

  assert.ok(rejection, `${mode}: expected rejection`)
  assert.equal(rejection.status, 423)
  assert.equal(squareCalls, 0)

  console.log(`${mode.toUpperCase()}: BLOCKED`)
}

console.log("NO ENVIRONMENT-VARIABLE BYPASS")
console.log("NO DATABASE OR SQUARE REQUESTS")
console.log("INVOICE FAIL-CLOSED GUARD TEST PASSED")