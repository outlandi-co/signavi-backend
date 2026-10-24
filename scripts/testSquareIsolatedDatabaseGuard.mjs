import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const source = readFileSync(
  new URL("../routes/square.js", import.meta.url),
  "utf8"
)

const startMarker =
  "    // Block legacy Square creation in the isolated"

const endMarker = "    const response ="

const start = source.indexOf(startMarker)
const end = source.indexOf(endMarker, start)

assert.ok(start >= 0, "Guard marker missing")
assert.ok(end > start, "Square call not found after guard")
assert.equal(
  source.indexOf(startMarker, start + 1),
  -1,
  "Multiple guards detected"
)

const guard = source.slice(start, end)

function check(databaseName) {
  let statusCode = null
  let response = null

  const res = {
    status(code) {
      statusCode = code
      return this
    },
    json(value) {
      response = value
      return value
    }
  }

  runInNewContext(
    `(function () {
      ${guard}
      return undefined
    })()`,
    {
      mongoose: {
        connection: {
          db: { databaseName }
        }
      },
      res
    },
    { timeout: 1000 }
  )

  return { statusCode, response }
}

const isolated = check("signavi_shipping_v3_dev")

assert.equal(isolated.statusCode, 423)
assert.equal(isolated.response.success, false)
console.log("ISOLATED V3 DATABASE: BLOCKED")

for (const database of [
  "signavi_store",
  "signavi_reservation_isolated_test"
]) {
  const result = check(database)

  assert.equal(result.statusCode, null)
  assert.equal(result.response, null)
}

console.log("OTHER DATABASES: GUARD DOES NOT BLOCK")
console.log("ACTUAL ROUTE GUARD SOURCE: VERIFIED")
console.log("NO DATABASE OR SQUARE REQUESTS")
console.log("ISOLATED DATABASE GUARD TEST PASSED")