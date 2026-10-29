import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const orders = readFileSync(
  new URL("../routes/orders.js", import.meta.url),
  "utf8"
)

const square = readFileSync(
  new URL("../routes/square.js", import.meta.url),
  "utf8"
)

assert.match(
  orders,
  /reason:\s*data\?\.reason\s*\|\|\s*"payment_checkout_failed"/
)

assert.match(
  orders,
  /res\.status\(response\.status\)\.json\(/
)

assert.match(
  square,
  /reason:\s*"payment_execution_not_authorized"/
)

const boundary = square.indexOf(
  "// Smart Shipping V3 storefront safety boundary."
)

const create = square.indexOf(
  "await client.checkout.paymentLinks.create("
)

assert.ok(boundary >= 0)
assert.ok(create > boundary)

assert.match(
  square.slice(boundary, create),
  /return res\.status\(423\)\.json\(/
)

console.log("PASS: Checkout propagates payment error reason")
console.log("PASS: Checkout preserves downstream HTTP status")
console.log("PASS: Production payment creation remains guarded")
console.log("NO PAYMENT REQUESTS")
console.log("NO DATABASE WRITES")