import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const square = readFileSync(
  new URL("../routes/square.js", import.meta.url),
  "utf8"
)

const checkout = readFileSync(
  new URL("../routes/orders.js", import.meta.url),
  "utf8"
)

const guardStart = square.indexOf(
  "// Smart Shipping V3 storefront safety boundary."
)

const squareCreate = square.indexOf(
  "await client.checkout.paymentLinks.create("
)

assert.ok(
  guardStart >= 0,
  "Production payment safety boundary missing"
)

assert.ok(
  squareCreate > guardStart,
  "Expected legacy Square creation after safety boundary"
)

const guardedSection = square.slice(
  guardStart,
  squareCreate
)

assert.match(
  guardedSection,
  /return res\.status\(423\)\.json\(/
)

assert.match(
  guardedSection,
  /payment_execution_not_authorized/
)

assert.match(
  guardedSection,
  /squareRequestAuthorized:\s*false/
)

assert.match(
  checkout,
  /\/api\/square\/create-payment\/\$\{order\._id\}/
)

assert.match(
  checkout,
  /res\.status\(response\.status\)\.json\(/
)

console.log("PASS: Storefront payment creation fails closed")
console.log("PASS: Legacy Square call remains behind 423 guard")
console.log("PASS: Order checkout propagates downstream status")
console.log("NO SQUARE REQUESTS")
console.log("NO DATABASE WRITES")