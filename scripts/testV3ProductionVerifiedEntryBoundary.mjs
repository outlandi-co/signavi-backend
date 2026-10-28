import assert from "node:assert/strict"

import {
  recordV3ProductionVerifiedEntryIsolated
} from "../utils/recordV3ProductionVerifiedEntryIsolated.js"

process.env.NODE_ENV = "test"

const id = "507f191e810c19729de86601"

let lookups = 0
let transactions = 0
let writes = 0

const query = result => ({
  lean: async () => result
})

const Order = {
  findById: () => query({
    _id: id,
    squareEnvironment: "production",
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "USD",
    squareExpectedAmountCents: 100
  }),
  findOne: () => {
    throw new Error("UNEXPECTED_TRANSACTION_READ")
  },
  updateOne: () => {
    writes++
    throw new Error("UNEXPECTED_ORDER_WRITE")
  }
}

const PaymentOperation = {
  findOne: () => query({
    orderId: id,
    environment: "production",
    status: "completed",
    idempotencyKey: `signavi-v3-production-purchase-${id}`,
    requestOwner: "synthetic-owner",
    amountCents: 100,
    squareOrderId: "synthetic-order",
    squarePaymentLinkId: "synthetic-link",
    paymentUrl: "https://square.link/u/synthetic"
  })
}

const connection = {
  startSession: async () => {
    transactions++
    throw new Error("UNEXPECTED_TRANSACTION")
  }
}

async function invoke(overrides = {}) {
  return recordV3ProductionVerifiedEntryIsolated({
    orderId: id,
    connection,
    Order,
    Reservation: {},
    PaymentOperation,
    expectedLocationId: "synthetic-location",
    lookupSquareEvidence: async () => {
      lookups++
      return {
        payment: {
          id: "synthetic-payment",
          status: "COMPLETED",
          order_id: "synthetic-order",
          location_id: "wrong-location",
          amount_money: {
            amount: 100,
            currency: "USD"
          }
        },
        squareOrder: {
          id: "synthetic-order",
          location_id: "synthetic-location",
          total_money: {
            amount: 100,
            currency: "USD"
          },
          reference_id: "invalid-reference"
        }
      }
    },
    ...overrides
  })
}

await assert.rejects(
  invoke({
    verifiedBinding: {
      bindingVerified: true,
      databaseWriteAuthorized: true
    }
  }),
  /rejected/
)

assert.equal(transactions, 0)
assert.equal(writes, 0)

console.log("PASS: Fabricated binding cannot bypass real verifier")

await assert.rejects(
  invoke({
    lookupSquareEvidence: async () => null
  }),
  /TRUSTED_SQUARE_EVIDENCE_MISSING/
)

console.log("PASS: Missing Square evidence rejected")

await assert.rejects(
  invoke({
    lookupSquareEvidence: undefined
  }),
  /TRUSTED_ENTRY_DEPENDENCIES_REQUIRED/
)

console.log("PASS: Missing lookup dependency rejected")

await assert.rejects(
  invoke({
    expectedLocationId: ""
  }),
  /TRUSTED_ENTRY_DEPENDENCIES_REQUIRED/
)

console.log("PASS: Missing trusted location rejected")

assert.equal(transactions, 0)
assert.equal(writes, 0)
assert.equal(lookups, 1)

console.log("PASS: Rejected evidence never starts transaction")

const before = process.env.NODE_ENV

try {
  process.env.NODE_ENV = "production"

  await assert.rejects(
    invoke(),
    /ISOLATED_TEST_ONLY/
  )
} finally {
  process.env.NODE_ENV = before
}

console.log("PASS: Production execution remains blocked")

console.log("")
console.log("STEP 65 VERIFIED ENTRY BOUNDARY: 6 CHECKS PASSED")
console.log("DATABASE: MOCKED")
console.log("NO REAL DATABASE WRITES")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
