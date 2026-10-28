import assert from "node:assert/strict"

import {
  recoverV3ProductionUncertainRecordingIsolated
} from "../utils/recoverV3ProductionUncertainRecordingIsolated.js"

process.env.NODE_ENV = "test"

const id = "507f191e810c19729de86801"
const paymentId = "synthetic-payment"
const squareOrderId = "synthetic-square-order"

const paid = {
  _id: id,
  squareEnvironment: "production",
  status: "paid",
  paymentStatus: "paid",
  squarePaymentId: paymentId,
  squareOrderId,
  squareExpectedAmountCents: 100
}

let checks = 0

async function check({
  label,
  recordingResult,
  recordingError,
  storedOrder,
  expectedOutcome,
  expectedReason,
  expectedReads
}) {
  let attempts = 0
  let reads = 0
  let writes = 0

  const result =
    await recoverV3ProductionUncertainRecordingIsolated({
      orderId: id,
      squarePaymentId: paymentId,
      squareOrderId,
      amountCents: 100,

      Order: {
        findById: () => {
          reads++
          return {
            lean: async () => {
              if (storedOrder instanceof Error) throw storedOrder
              return storedOrder
            }
          }
        },
        updateOne: () => {
          writes++
          throw new Error("UNEXPECTED_WRITE")
        }
      },

      attemptRecording: async () => {
        attempts++
        if (recordingError) throw recordingError
        return recordingResult
      }
    })

  assert.equal(result.outcome, expectedOutcome)
  assert.equal(result.reason, expectedReason)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.paymentCreationAuthorized, false)
  assert.equal(result.databaseWriteAuthorized, false)
  assert.equal(attempts, 1)
  assert.equal(reads, expectedReads)
  assert.equal(writes, 0)

  checks++
  console.log(`PASS: ${label}`)
}

await check({
  label: "Acknowledged payment requires no reconciliation",
  recordingResult: { recorded: true },
  storedOrder: paid,
  expectedOutcome: "recorded",
  expectedReason: "RECORDING_ACKNOWLEDGED",
  expectedReads: 0
})

await check({
  label: "Lost acknowledgment recovers exact payment",
  recordingError: new Error("ACK_LOST_AFTER_COMMIT"),
  storedOrder: paid,
  expectedOutcome: "matching_payment_recorded",
  expectedReason: "EXACT_DURABLE_PAYMENT_MATCH",
  expectedReads: 1
})

await check({
  label: "Unpaid order never authorizes retry",
  recordingError: new Error("UNKNOWN_COMMIT"),
  storedOrder: {
    ...paid,
    status: "payment_required",
    paymentStatus: "unpaid",
    squarePaymentId: ""
  },
  expectedOutcome: "unknown",
  expectedReason: "PAYMENT_NOT_RECORDED",
  expectedReads: 1
})

await check({
  label: "Conflicting payment remains on hold",
  recordingError: new Error("UNKNOWN_COMMIT"),
  storedOrder: {
    ...paid,
    squarePaymentId: "another-payment"
  },
  expectedOutcome: "hold",
  expectedReason: "CONFLICTING_PAID_PAYMENT",
  expectedReads: 1
})

await check({
  label: "Failed database lookup remains unknown",
  recordingError: new Error("UNKNOWN_COMMIT"),
  storedOrder: new Error("DATABASE_UNAVAILABLE"),
  expectedOutcome: "unknown",
  expectedReason: "DATABASE_LOOKUP_FAILED",
  expectedReads: 1
})

await check({
  label: "Unexpected recording result cannot authorize retry",
  recordingResult: { recorded: false },
  storedOrder: paid,
  expectedOutcome: "unknown",
  expectedReason: "RECORDING_RESULT_UNCONFIRMED",
  expectedReads: 0
})

assert.equal(checks, 6)

console.log("PASS: Every scenario used exactly one recording attempt")

let invalidAttempts = 0

await assert.rejects(
  recoverV3ProductionUncertainRecordingIsolated({
    orderId: "invalid",
    Order: { findById: () => ({ lean: async () => null }) },
    squarePaymentId: paymentId,
    squareOrderId,
    amountCents: 100,
    attemptRecording: async () => { invalidAttempts++ }
  }),
  /RECOVERY_INPUT_INVALID/
)

assert.equal(invalidAttempts, 0)
console.log("PASS: Invalid identity rejected before recording")

const previous = process.env.NODE_ENV

try {
  process.env.NODE_ENV = "production"

  await assert.rejects(
    recoverV3ProductionUncertainRecordingIsolated({}),
    /ISOLATED_TEST_ONLY/
  )
} finally {
  process.env.NODE_ENV = previous
}

console.log("PASS: Production execution blocked")

console.log("")
console.log("STEP 73 UNCERTAIN RECORDING RECOVERY: PASSED")
console.log("NO REAL DATABASE CONNECTIONS")
console.log("NO SQUARE REQUESTS")
console.log("NO AUTOMATIC PAYMENT OR RECORDING RETRIES")
