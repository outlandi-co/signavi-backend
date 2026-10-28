import assert from "node:assert/strict"

import {
  reconcileV3ProductionPaymentOutcomeIsolated
} from "../utils/reconcileV3ProductionPaymentOutcomeIsolated.js"

process.env.NODE_ENV = "test"

const id = "507f191e810c19729de86701"
const paymentId = "synthetic-payment"
const squareOrderId = "synthetic-square-order"

const base = {
  _id: id,
  squareEnvironment: "production",
  status: "paid",
  paymentStatus: "paid",
  squarePaymentId: paymentId,
  squareOrderId,
  squareExpectedAmountCents: 100
}

let checks = 0
let reads = 0
let writes = 0

async function check(label, record, expectedOutcome, expectedReason) {
  const Order = {
    findById: requestedId => {
      assert.equal(requestedId, id)
      reads++

      return {
        lean: async () => {
          if (record instanceof Error) throw record
          return record
        }
      }
    },

    updateOne: () => {
      writes++
      throw new Error("WRITE_NOT_ALLOWED")
    }
  }

  const result =
    await reconcileV3ProductionPaymentOutcomeIsolated({
      orderId: id,
      Order,
      squarePaymentId: paymentId,
      squareOrderId,
      amountCents: 100
    })

  assert.equal(result.outcome, expectedOutcome)
  assert.equal(result.reason, expectedReason)
  assert.equal(result.recorded, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.paymentCreationAuthorized, false)
  assert.equal(result.databaseWriteAuthorized, false)

  checks++
  console.log(`PASS: ${label}`)
}

await check(
  "Exact committed payment identified",
  base,
  "matching_payment_recorded",
  "EXACT_DURABLE_PAYMENT_MATCH"
)

await check(
  "Unpaid order held for reconciliation",
  {
    ...base,
    status: "payment_required",
    paymentStatus: "unpaid",
    squarePaymentId: ""
  },
  "unknown",
  "PAYMENT_NOT_RECORDED"
)

await check(
  "Conflicting paid identity held",
  {
    ...base,
    squarePaymentId: "different-payment"
  },
  "hold",
  "CONFLICTING_PAID_PAYMENT"
)

await check(
  "Incorrect stored amount held",
  {
    ...base,
    squareExpectedAmountCents: 999
  },
  "hold",
  "CONFLICTING_PAID_PAYMENT"
)

await check(
  "Sandbox identity held",
  {
    ...base,
    squareEnvironment: "sandbox"
  },
  "hold",
  "ORDER_IDENTITY_MISMATCH"
)

await check(
  "Missing order remains unknown",
  null,
  "unknown",
  "ORDER_NOT_FOUND"
)

await check(
  "Database lookup failure remains unknown",
  new Error("SIMULATED_DATABASE_FAILURE"),
  "unknown",
  "DATABASE_LOOKUP_FAILED"
)

await check(
  "Unexpected refunded state held",
  {
    ...base,
    status: "refunded",
    paymentStatus: "refunded"
  },
  "hold",
  "UNEXPECTED_ORDER_STATE"
)

assert.equal(checks, 8)
assert.equal(reads, 8)
assert.equal(writes, 0)

console.log("PASS: All outcomes remain read-only")

const previous = process.env.NODE_ENV

try {
  process.env.NODE_ENV = "production"

  await assert.rejects(
    reconcileV3ProductionPaymentOutcomeIsolated({
      orderId: id
    }),
    /ISOLATED_TEST_ONLY/
  )
} finally {
  process.env.NODE_ENV = previous
}

console.log("PASS: Production execution remains blocked")

console.log("")
console.log("STEP 71 RECONCILIATION: 10 CHECKS PASSED")
console.log("NO DATABASE CONNECTION")
console.log("NO DATABASE WRITES")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION OR RETRIES")
