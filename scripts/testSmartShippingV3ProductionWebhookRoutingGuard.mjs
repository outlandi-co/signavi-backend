import assert from "node:assert/strict"
import fs from "node:fs"

const source = fs.readFileSync(
  "routes/squareWebhook.js",
  "utf8"
)

const start = source.indexOf(
  "// Production V3 routing boundary."
)

const invoiceLookup = source.indexOf(
  "const matchingInvoices = await Invoice.find"
)

assert.ok(start >= 0, "Guard must exist")
assert.ok(invoiceLookup > start, "Guard must precede invoice lookup")

const guard = source.slice(start, invoiceLookup)

assert.match(guard, /squareMode === "production"/)
assert.match(guard, /startsWith\("signavi-v3-"\)/)
assert.match(guard, /return res\.sendStatus\(200\)/)

assert.ok(
  source.includes("verifyV3WebhookPaymentBinding({"),
  "Existing Sandbox verification must remain present"
)

assert.ok(
  source.includes("await reconcileInvoicePayment("),
  "Existing invoice reconciliation must remain present"
)

assert.ok(
  source.includes("const order = await resolveOrder(squareOrder)"),
  "Existing order resolution must remain present"
)

console.log("PASS: Production V3 guard exists")
console.log("PASS: Guard precedes invoice reconciliation")
console.log("PASS: V3 prefix is recognized")
console.log("PASS: Production V3 fails closed")
console.log("PASS: Sandbox verifier retained")
console.log("PASS: Legacy invoice and order paths retained")
console.log("")
console.log("STATIC ROUTING SAFEGUARDS: PASS")
console.log("NO SQUARE REQUESTS")
console.log("NO DATABASE WRITES")
