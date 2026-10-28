import assert from "node:assert/strict"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const schema = PaymentOperation.schema

const environment = schema.path("environment")

assert.deepEqual(
  environment.enumValues,
  ["sandbox", "production"]
)

console.log("PASS: Sandbox and production supported")

assert.equal(environment.isRequired, true)

console.log("PASS: Environment remains required")

const indexes = schema.indexes()

function hasUniqueIndex(field) {
  return indexes.some(([fields, options]) =>
    fields[field] === 1 && options.unique === true
  )
}

assert.equal(hasUniqueIndex("orderId"), true)
assert.equal(hasUniqueIndex("idempotencyKey"), true)

console.log("PASS: Order and idempotency uniqueness retained")

const required = schema.path("amountCents")

assert.equal(required.isRequired, true)

console.log("PASS: Payment amount remains required")

console.log("")
console.log("PRODUCTION OPERATION SCHEMA: 4 CHECKS PASSED")
console.log("NO DATABASE CONNECTION")
console.log("NO SQUARE REQUESTS")
