import assert from "node:assert/strict"
import mongoose from "mongoose"

import {
  recoverV3ProductionUncertainRecordingIsolated
} from "../utils/recoverV3ProductionUncertainRecordingIsolated.js"

process.env.NODE_ENV = "test"

const id = "507f191e810c19729de86901"
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

const unpaid = {
  ...paid,
  status: "payment_required",
  paymentStatus: "unpaid",
  squarePaymentId: ""
}

const conflict = {
  ...paid,
  squarePaymentId: "different-payment"
}

function driverError(label) {
  const error = new mongoose.mongo.MongoServerError({
    message: "SIMULATED_TRANSACTION_FAILURE",
    code: 251,
    codeName: "NoSuchTransaction"
  })

  if (label) error.addErrorLabel(label)
  return error
}

let checks = 0

async function verify({
  label,
  errorLabel,
  storedOrder,
  expectedOutcome,
  expectedReason
}) {
  const error = driverError(errorLabel)

  if (errorLabel) {
    assert.equal(error.hasErrorLabel(errorLabel), true)
  }

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
              if (storedOrder instanceof Error) {
                throw storedOrder
              }
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
        throw error
      }
    })

  assert.equal(result.outcome, expectedOutcome)
  assert.equal(result.reason, expectedReason)
  assert.equal(result.retryAuthorized, false)
  assert.equal(result.paymentCreationAuthorized, false)
  assert.equal(result.databaseWriteAuthorized, false)

  assert.equal(attempts, 1)
  assert.equal(reads, 1)
  assert.equal(writes, 0)

  checks++
  console.log(`PASS: ${label}`)
}

await verify({
  label: "Unknown commit label with recorded payment",
  errorLabel: "UnknownTransactionCommitResult",
  storedOrder: paid,
  expectedOutcome: "matching_payment_recorded",
  expectedReason: "EXACT_DURABLE_PAYMENT_MATCH"
})

await verify({
  label: "Unknown commit label with unpaid order",
  errorLabel: "UnknownTransactionCommitResult",
  storedOrder: unpaid,
  expectedOutcome: "unknown",
  expectedReason: "PAYMENT_NOT_RECORDED"
})

await verify({
  label: "Unknown commit label with conflicting payment",
  errorLabel: "UnknownTransactionCommitResult",
  storedOrder: conflict,
  expectedOutcome: "hold",
  expectedReason: "CONFLICTING_PAID_PAYMENT"
})

await verify({
  label: "Transient transaction label does not trigger application retry",
  errorLabel: "TransientTransactionError",
  storedOrder: unpaid,
  expectedOutcome: "unknown",
  expectedReason: "PAYMENT_NOT_RECORDED"
})

await verify({
  label: "Transient transaction label with recorded payment",
  errorLabel: "TransientTransactionError",
  storedOrder: paid,
  expectedOutcome: "matching_payment_recorded",
  expectedReason: "EXACT_DURABLE_PAYMENT_MATCH"
})

await verify({
  label: "Unknown commit with failed reconciliation read",
  errorLabel: "UnknownTransactionCommitResult",
  storedOrder: new Error("DATABASE_UNAVAILABLE"),
  expectedOutcome: "unknown",
  expectedReason: "DATABASE_LOOKUP_FAILED"
})

await verify({
  label: "Unlabeled transaction error fails closed",
  errorLabel: null,
  storedOrder: unpaid,
  expectedOutcome: "unknown",
  expectedReason: "PAYMENT_NOT_RECORDED"
})

assert.equal(checks, 7)

console.log("")
console.log("STEP 75 MONGODB DRIVER-LABELED ERROR RECOVERY: 7 CHECKS PASSED")
console.log("ERRORS: SIMULATED USING MONGODB DRIVER CLASS")
console.log("DATABASE: MOCKED")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO PAYMENT CREATION OR APPLICATION RETRIES")
