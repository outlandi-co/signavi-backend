import assert from "node:assert/strict"

import {
  processV3SquareCreationResponse as processResponse
} from "../utils/smartShippingV3CreationRecording.js"

const linkId = "sandbox-link-123"
const orderId = "sandbox-order-456"
const paymentUrl = "https://square.link/u/example"
const reference = "signavi-v3-order-123"

let createCalls = 0
let recordCalls = 0
let lookupCalls = 0

const makeClient = ({ changedOrderId, wrongAmount, throwLookup } = {}) => ({
  checkout: {
    paymentLinks: {
      create: async () => {
        createCalls++
        throw new Error("Payment creation is forbidden")
      },
      get: async () => {
        lookupCalls++
        if (throwLookup) {
          throw new Error("Simulated Square lookup failure")
        }
        return {
          paymentLink: {
            id: linkId,
            orderId: changedOrderId || orderId,
            url: paymentUrl
          }
        }
      }
    }
  },
  orders: {
    get: async () => {
      lookupCalls++
      return {
        order: {
          id: changedOrderId || orderId,
          referenceId: reference,
          locationId: "sandbox-location",
          totalMoney: {
            amount: wrongAmount ? 5529n : 5528n,
            currency: "USD"
          }
        }
      }
    }
  }
})

const creationResponse = {
  paymentLink: {
    id: linkId,
    orderId,
    url: paymentUrl
  }
}

const run = (options = {}) => processResponse({
  response: options.response ?? creationResponse,
  error: options.error,
  client: makeClient(options),
  expectedAmountCents: 5528,
  expectedReferenceId: reference,
  expectedLocationId: "sandbox-location",
  recordVerifiedLink: async () => {
    recordCalls++
    if (options.rejectRecording) {
      throw new Error("Simulated MongoDB recording failure")
    }
    return { recorded: true }
  }
})

const success = await run()
assert.equal(success.status, "completed")
assert.equal(success.verified, true)
assert.equal(success.paymentLinkRecorded, true)
assert.equal(success.customerPaymentConfirmed, false)
assert.equal(recordCalls, 1)
assert.equal(lookupCalls, 2)
assert.equal(createCalls, 0)
console.log("VERIFIED RESPONSE RECORDED: PASS")

const reject = async (label, options) => {
  const before = recordCalls
  const result = await run(options)

  assert.equal(result.status, "reconciliation_required")
  assert.equal(result.safeToRetryCreation, false)
  assert.equal(result.customerPaymentConfirmed, false)
  assert.equal(recordCalls, before)
  assert.equal(createCalls, 0)

  console.log(`${label}: PASS`)
}

await reject("SQUARE TIMEOUT REQUIRES RECONCILIATION", {
  error: new Error("Timeout")
})

await reject("LOOKUP FAILURE REQUIRES RECONCILIATION", {
  throwLookup: true
})

await reject("WRONG AMOUNT BLOCKS RECORDING", {
  wrongAmount: true
})

await reject("CREATION/LOOKUP ORDER MISMATCH BLOCKED", {
  changedOrderId: "different-square-order"
})

const beforeFailure = recordCalls
const recordingFailure = await run({ rejectRecording: true })

assert.equal(recordingFailure.status, "reconciliation_required")
assert.equal(recordCalls, beforeFailure + 1)
assert.equal(recordingFailure.safeToRetryCreation, false)
console.log("RECORDING FAILURE REQUIRES RECONCILIATION: PASS")

assert.equal(createCalls, 0)
console.log("NO SQUARE PAYMENT CREATION: PASS")
console.log("ALL V3 CREATION RECORDING TESTS PASSED")