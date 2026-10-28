import assert from "node:assert/strict"
import mongoose from "mongoose"

import Reservation from
  "../models/SmartShippingV3ProductionPurchaseReservation.js"

const orderId = "507f191e810c19729de860ea"
const invoiceId = "507f191e810c19729de860eb"

const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const makeReservation = overrides =>
  new Reservation({
    environment: "production",
    orderId,
    purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    status: "reserved",
    idempotencyKey:
      `signavi-v3-production-purchase-${orderId}`,
    ...overrides
  })

const valid = makeReservation()

await valid.validate()
console.log("PASS: Valid production reservation")

const invoiceOwned = makeReservation({
  claimedByDocumentType: "invoice",
  claimedByDocumentId: invoiceId
})

await invoiceOwned.validate()
assert.equal(invoiceOwned.purchaseKey, valid.purchaseKey)

console.log("PASS: Order and invoice use same purchase key")

const indexes = Reservation.schema.indexes()

const hasUniqueIndex = fields =>
  indexes.some(([keys, options]) =>
    options.unique === true &&
    JSON.stringify(Object.keys(keys)) ===
      JSON.stringify(fields)
  )

assert.ok(
  hasUniqueIndex(["environment", "purchaseKey"])
)
console.log("PASS: Unique canonical purchase index declared")

assert.ok(
  hasUniqueIndex(["environment", "orderId"])
)
console.log("PASS: Unique order index declared")

assert.ok(
  hasUniqueIndex(["environment", "idempotencyKey"])
)
console.log("PASS: Unique idempotency index declared")

const sandbox = makeReservation({
  environment: "sandbox"
})

await assert.rejects(sandbox.validate())
console.log("PASS: Sandbox reservation rejected")

const invalidPurchase = makeReservation({
  purchaseKey: "incorrect-purchase-key"
})

await assert.rejects(invalidPurchase.validate())
console.log("PASS: Invalid purchase key rejected")

const invalidStatus = makeReservation({
  status: "payment_authorized"
})

await assert.rejects(invalidStatus.validate())
console.log("PASS: Unsupported reservation status rejected")

const invalidOwner = makeReservation({
  claimedByDocumentType: "customer"
})

await assert.rejects(invalidOwner.validate())
console.log("PASS: Invalid owner type rejected")

assert.equal(
  Reservation.schema.path("purchaseKey").options.immutable,
  true
)

console.log("PASS: Purchase identity immutable")

assert.equal(
  Reservation.schema.path("idempotencyKey").options.immutable,
  true
)

console.log("PASS: Idempotency identity immutable")

assert.equal(
  mongoose.connection.readyState,
  0
)

console.log("PASS: No database connection opened")

console.log("")
console.log("PRODUCTION RESERVATION SCHEMA: 12 CHECKS PASSED")
console.log("UNIQUE INDEXES DECLARED, NOT YET VERIFIED IN MONGODB")
console.log("NO DATABASE WRITES")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
