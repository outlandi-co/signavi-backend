import assert from "node:assert/strict"

import {
  reserveV3ProductionPurchaseIsolated
} from "../utils/reserveV3ProductionPurchaseIsolated.js"

process.env.NODE_ENV = "test"

const orderId = "507f191e810c19729de860ea"
const invoiceId = "507f191e810c19729de860eb"

const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const order = {
  _id: orderId,
  squareEnvironment: "production"
}

const association = {
  orderId,
  invoiceId,
  environment: "production"
}

const records = new Map()
let createCalls = 0

// This repository simulates a MongoDB unique-index
// rejection. It does not replace a real MongoDB test.
const Reservation = {
  async create(data) {
    createCalls++

    await Promise.resolve()

    if (records.has(data.purchaseKey)) {
      const error = new Error("Duplicate purchase")
      error.code = 11000
      throw error
    }

    records.set(data.purchaseKey, { ...data })

    return { ...data }
  }
}

const common = {
  orderId,
  loadOrder: async id =>
    id === orderId ? order : null,
  loadAssociation: async query =>
    query.orderId === orderId &&
    query.invoiceId === invoiceId &&
    query.environment === "production"
      ? association
      : null,
  Reservation
}

const attempt = documentType =>
  reserveV3ProductionPurchaseIsolated({
    ...common,
    documentType,
    documentId:
      documentType === "order" ? orderId : invoiceId
  })

const documentTypes = Array.from(
  { length: 50 },
  (_, i) => i % 2 === 0 ? "order" : "invoice"
)

const results = await Promise.all(
  documentTypes.map(attempt)
)

const winners = results.filter(x => x.reserved)
const blocked = results.filter(x => x.blocked)

assert.equal(results.length, 50)
assert.equal(winners.length, 1)
assert.equal(blocked.length, 49)

console.log("PASS: 50 competing attempts")
console.log("PASS: Exactly one reservation winner")
console.log("PASS: 49 competing attempts blocked")

assert.equal(records.size, 1)

console.log("PASS: Exactly one reservation record")

assert.equal(
  records.get(purchaseKey)?.purchaseKey,
  purchaseKey
)

console.log("PASS: Canonical purchase key preserved")

assert.equal(
  records.get(purchaseKey)?.idempotencyKey,
  purchaseKey
)

console.log("PASS: Idempotency identity shared")

assert.equal(createCalls, 50)

console.log("PASS: Every competitor reached reservation gate")

assert.ok(
  blocked.every(
    result =>
      result.reason === "PURCHASE_ALREADY_RESERVED"
  )
)

console.log("PASS: All competitors received blocked result")

const replay = await attempt("invoice")

assert.equal(replay.blocked, true)
assert.equal(records.size, 1)

console.log("PASS: Invoice replay cannot create another reservation")

await assert.rejects(
  reserveV3ProductionPurchaseIsolated({
    ...common,
    documentType: "invoice",
    documentId: "507f191e810c19729de860ec"
  }),
  /PRODUCTION_ASSOCIATION_NOT_VERIFIED/
)

assert.equal(records.size, 1)

console.log("PASS: Unassociated invoice rejected")

await assert.rejects(
  reserveV3ProductionPurchaseIsolated({
    ...common,
    documentType: "order",
    documentId: orderId,
    loadOrder: async () => ({
      ...order,
      squareEnvironment: "sandbox"
    })
  }),
  /PRODUCTION_ORDER_NOT_VERIFIED/
)

console.log("PASS: Sandbox order rejected")

const recordCountBeforeErrors = records.size

await assert.rejects(
  reserveV3ProductionPurchaseIsolated({
    ...common,
    documentType: "order",
    documentId: orderId,
    Reservation: {
      create: async () => {
        throw new Error("DATABASE_UNAVAILABLE")
      }
    }
  }),
  /DATABASE_UNAVAILABLE/
)

assert.equal(records.size, recordCountBeforeErrors)

console.log("PASS: Database failure fails closed")

const originalMode = process.env.NODE_ENV

try {
  process.env.NODE_ENV = "production"

  await assert.rejects(
    attempt("order"),
    /ISOLATED_TEST_ONLY/
  )

  console.log("PASS: Production execution blocked")
} finally {
  process.env.NODE_ENV = originalMode
}

console.log("")
console.log("ISOLATED PRODUCTION RESERVATION TESTS: PASSED")
console.log("ATTEMPTS: 50")
console.log("WINNERS: 1")
console.log("BLOCKED: 49")
console.log("SIMULATED RESERVATION RECORDS: 1")
console.log("NO MONGODB CONNECTION")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
