import assert from "node:assert/strict"

import {
  createV3ProductionEvidenceBoundaryIsolated
} from "../utils/createV3ProductionEvidenceBoundaryIsolated.js"

process.env.NODE_ENV = "test"

const id = "507f191e810c19729de87001"

let trustedLookups = 0
let attackerLookups = 0
let transactionStarts = 0
let writes = 0

const boundary = createV3ProductionEvidenceBoundaryIsolated({
  expectedLocationId: "server-controlled-location",

  lookupSquareEvidence: async ({ squareOrderId }) => {
    trustedLookups++

    assert.equal(squareOrderId, "stored-square-order")

    // Deliberately return no evidence. Recording must fail closed.
    return null
  }
})

const Order = {
  findById: requestedId => {
    assert.equal(requestedId, id)

    return {
      lean: async () => ({
        _id: id,
        squareEnvironment: "production",
        status: "payment_required",
        paymentStatus: "unpaid"
      })
    }
  },

  updateOne: async () => {
    writes++
    throw new Error("UNEXPECTED_ORDER_WRITE")
  }
}

const PaymentOperation = {
  findOne: filters => {
    assert.equal(filters.orderId, id)
    assert.equal(filters.environment, "production")

    return {
      lean: async () => ({
        orderId: id,
        environment: "production",
        squareOrderId: "stored-square-order"
      })
    }
  }
}

const request = {
  orderId: id,
  connection: {
    startSession: async () => {
      transactionStarts++
      throw new Error("UNEXPECTED_TRANSACTION")
    }
  },
  Order,
  Reservation: {},
  PaymentOperation,

  // These are deliberately attacker-controlled values.
  // The new record() API must ignore them.
  expectedLocationId: "attacker-location",

  lookupSquareEvidence: async () => {
    attackerLookups++

    return {
      payment: {
        id: "fabricated-payment",
        status: "COMPLETED"
      },
      squareOrder: {
        id: "fabricated-square-order"
      }
    }
  },

  verifiedBinding: {
    bindingVerified: true,
    databaseWriteAuthorized: true
  }
}

await assert.rejects(
  boundary.record(request),
  /TRUSTED_SQUARE_EVIDENCE_MISSING/
)

assert.equal(trustedLookups, 1)
assert.equal(attackerLookups, 0)
assert.equal(transactionStarts, 0)
assert.equal(writes, 0)

console.log("PASS: Factory-bound evidence provider selected")
console.log("PASS: Request-supplied provider ignored")
console.log("PASS: Fabricated verified binding ignored")
console.log("PASS: No transaction started without evidence")

await assert.rejects(
  boundary.record({
    ...request,
    orderId: "invalid-order"
  }),
  /TRUSTED_ENTRY_DEPENDENCIES_REQUIRED/
)

assert.equal(trustedLookups, 1)

console.log("PASS: Invalid order rejected before Square lookup")

assert.throws(
  () => createV3ProductionEvidenceBoundaryIsolated({
    expectedLocationId: "server-location"
  }),
  /SERVER_EVIDENCE_PROVIDER_REQUIRED/
)

console.log("PASS: Missing server provider rejected")

const previous = process.env.NODE_ENV

try {
  process.env.NODE_ENV = "production"

  await assert.rejects(
    boundary.record(request),
    /ISOLATED_TEST_ONLY/
  )

  assert.throws(
    () => createV3ProductionEvidenceBoundaryIsolated({
      expectedLocationId: "server-location",
      lookupSquareEvidence: async () => null
    }),
    /ISOLATED_TEST_ONLY/
  )
} finally {
  process.env.NODE_ENV = previous
}

console.log("PASS: Production invocation blocked")
console.log("PASS: Production factory creation blocked")

assert.equal(attackerLookups, 0)
assert.equal(transactionStarts, 0)
assert.equal(writes, 0)

console.log("")
console.log("STEP 81 EVIDENCE BOUNDARY: 8 CHECKS PASSED")
console.log("DATABASE: MOCKED")
console.log("SQUARE: MOCKED")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO DATABASE WRITES")
console.log("NO PAYMENT CREATION")
