import assert from "node:assert/strict"

import {
  recordV3ProductionPaymentTransactionalIsolated
} from "../utils/recordV3ProductionPaymentTransactionalIsolated.js"

process.env.NODE_ENV = "test"

const id = "507f191e810c19729de86501"
const purchaseKey = `signavi-v3-production-purchase-${id}`

let writes = 0
let verifierCalls = 0
let transactionCalls = 0

const fakeBinding = {
  bindingVerified: true,
  environment: "production",
  orderId: id,
  squarePaymentId: "fabricated-payment",
  squareOrderId: "fabricated-square-order",
  amountCents: 100,
  databaseWriteAuthorized: false,
  paymentCreationAuthorized: false
}

const session = {
  withTransaction: async callback => {
    transactionCalls++
    return callback()
  },
  endSession: async () => {}
}

const query = value => ({
  session: async () => value
})

const result = await recordV3ProductionPaymentTransactionalIsolated({
  orderId: id,

  connection: {
    startSession: async () => session
  },

  Order: {
    findOne: () => query({
      _id: id,
      squareEnvironment: "production",
      status: "payment_required",
      paymentStatus: "unpaid",
      squareExpectedAmountCents: 100,
      squarePaymentId: "",
      squareOrderId: ""
    }),

    updateOne: async () => {
      writes++
      return { matchedCount: 1, modifiedCount: 1 }
    }
  },

  Reservation: {
    findOne: () => query({
      _id: "507f191e810c19729de86502",
      environment: "production",
      orderId: id,
      purchaseKey,
      idempotencyKey: purchaseKey,
      claimedByDocumentType: "order",
      claimedByDocumentId: id,
      status: "claim_pending",
      attemptClaimedAt: new Date()
    }),

    updateOne: async () => ({
      matchedCount: 1,
      modifiedCount: 1
    })
  },

  PaymentOperation: {
    findOne: () => query({
      _id: "507f191e810c19729de86503",
      environment: "production",
      orderId: id,
      idempotencyKey: purchaseKey,
      status: "completed",
      amountCents: 100,
      squareOrderId: "fabricated-square-order",
      squareCreationAttemptClaimedAt: new Date()
    }),

    updateOne: async () => ({
      matchedCount: 1,
      modifiedCount: 1
    })
  },

  verifiedBinding: fakeBinding
})

assert.equal(result.recorded, true)
assert.equal(writes, 1)
assert.equal(transactionCalls, 1)
assert.equal(verifierCalls, 0)
assert.equal(result.squareCreationAuthorized, false)
assert.equal(result.retryAuthorized, false)

console.log("RISK REPRODUCED: Fabricated binding accepted by test-only recorder")
console.log("RISK REPRODUCED: Real verifier was not invoked")
console.log("PASS: Production payment creation remains unauthorized")

const previous = process.env.NODE_ENV

try {
  process.env.NODE_ENV = "production"

  await assert.rejects(
    recordV3ProductionPaymentTransactionalIsolated({
      orderId: id,
      verifiedBinding: fakeBinding
    }),
    /ISOLATED_TEST_ONLY/
  )
} finally {
  process.env.NODE_ENV = previous
}

console.log("PASS: Production execution remains blocked")
console.log("")
console.log("STEP 64 TRUST-BOUNDARY CHARACTERIZATION: COMPLETE")
console.log("DATABASE: MOCKED")
console.log("NO REAL DATABASE WRITES")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
