import assert from "node:assert/strict"
import fs from "node:fs"

const source = fs.readFileSync(
  "routes/squareWebhook.js",
  "utf8"
)

const start = source.indexOf(
  "// Production V3 verification boundary."
)

const invoiceLookup = source.indexOf(
  "const matchingInvoices = await Invoice.find"
)

assert.ok(start >= 0, "Production verification guard must exist")
assert.ok(invoiceLookup > start, "Guard must precede invoice routing")

const guard = source.slice(start, invoiceLookup)

assert.match(guard, /squareMode === "production"/)
assert.match(guard, /startsWith\("signavi-v3-"\)/)

assert.match(
  guard,
  /parseV3WebhookOrderReference\(\{/
)

assert.match(
  guard,
  /SmartShippingV3PaymentOperation\.findOne\(\{/
)

assert.match(
  guard,
  /environment: "production"/
)

assert.match(
  guard,
  /verifyV3ProductionWebhookPaymentBinding\(\{/
)

assert.match(
  guard,
  /return res\.sendStatus\(200\)/
)

assert.ok(
  guard.lastIndexOf("return res.sendStatus(200)") >
  guard.indexOf("verifyV3ProductionWebhookPaymentBinding({"),
  "Production V3 must exit after verification"
)

assert.doesNotMatch(
  guard,
  /findOneAndUpdate|\.save\(|reconcileInvoicePayment/
)

assert.match(
  guard,
  /reconciliation disabled/
)

assert.match(
  source,
  /verifyV3WebhookPaymentBinding\(\{/
)

assert.match(
  source,
  /await reconcileInvoicePayment\(/
)

console.log("PASS: Production verification boundary exists")
console.log("PASS: Guard executes before invoice routing")
console.log("PASS: Production operation lookup required")
console.log("PASS: Production payment binding required")
console.log("PASS: Production V3 exits before legacy reconciliation")
console.log("PASS: No payment status writes in production guard")
console.log("PASS: Sandbox and legacy handling preserved in source")
console.log("")
console.log("PRODUCTION ROUTING STATIC TEST: PASSED")
console.log("NO SQUARE REQUESTS")
console.log("NO DATABASE WRITES")
