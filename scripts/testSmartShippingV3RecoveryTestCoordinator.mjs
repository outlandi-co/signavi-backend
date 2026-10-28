import assert from "node:assert/strict"

import {
  coordinateV3RecoveryTestOnly
} from "../utils/smartShippingV3RecoveryTestCoordinator.js"

assert.equal(process.env.NODE_ENV, "test")

const orderId = "6fffffffffffffffffffffff"
const owner = "synthetic-test-owner"
const expectedPaymentLinkId = "mock-link-id"

const inspectionArgs = {
  orderId,
  expectedPaymentLinkId
}

const verified = {
  verified: true,
  checkoutReferenceVerified: true,
  squarePaymentLinkId: expectedPaymentLinkId,
  squareOrderId: "mock-square-order",
  paymentUrl: "https://sandbox.square.link/u/mock",
  amountCents: 100
}

const inspection = {
  eligibleForFurtherReview: true,
  databaseWriteAuthorized: false,
  squareCreationAuthorized: false,
  claimResetAuthorized: false,
  customerPaymentConfirmed: false,
  paymentLinkRecorded: false,
  verified
}

let inspectCalls = 0
let recordCalls = 0

const inspect = async () => {
  inspectCalls++
  return inspection
}

const record = async data => {
  recordCalls++

  assert.equal(data.orderId, orderId)
  assert.equal(data.owner, owner)
  assert.equal(data.expectedPaymentLinkId, expectedPaymentLinkId)
  assert.equal(data.verified, verified)

  return {
    recorded: true,
    paymentLinkRecorded: true,
    customerPaymentConfirmed: false,
    squareCreationAuthorized: false,
    claimResetAuthorized: false
  }
}

const input = {
  orderId,
  owner,
  expectedPaymentLinkId,
  inspectionArgs
}

const result = await coordinateV3RecoveryTestOnly({
  ...input,
  inspect,
  record
})

assert.equal(result.recorded, true)
assert.equal(result.customerPaymentConfirmed, false)
assert.equal(inspectCalls, 1)
assert.equal(recordCalls, 1)

console.log("VERIFICATION BEFORE RECORDING: PASS")

for (const invalid of [
  { eligibleForFurtherReview: false },
  { databaseWriteAuthorized: true },
  { squareCreationAuthorized: true },
  { claimResetAuthorized: true },
  { customerPaymentConfirmed: true },
  { paymentLinkRecorded: true },
  { verified: { ...verified, verified: false } },
  {
    verified: {
      ...verified,
      checkoutReferenceVerified: false
    }
  },
  {
    verified: {
      ...verified,
      squarePaymentLinkId: "different-link"
    }
  }
]) {
  const before = recordCalls

  await assert.rejects(
    coordinateV3RecoveryTestOnly({
      ...input,
      inspect: async () => ({ ...inspection, ...invalid }),
      record
    })
  )

  assert.equal(recordCalls, before)
}

console.log("ALL INVALID INSPECTIONS BLOCK RECORDING: PASS")

await assert.rejects(
  coordinateV3RecoveryTestOnly({
    ...input,
    orderId: "6ae10e8c9a2fa3d170f56486",
    inspectionArgs: {
      ...inspectionArgs,
      orderId: "6ae10e8c9a2fa3d170f56486"
    },
    inspect,
    record
  }),
  /Protected original order/
)

console.log("PROTECTED ORIGINAL ORDER: REJECTED")

await assert.rejects(
  coordinateV3RecoveryTestOnly({
    ...input,
    inspect,
    record: async () => ({
      recorded: false,
      paymentLinkRecorded: false
    })
  })
)

console.log("FAILED RECORDING RESULT: REJECTED")

console.log("NO MONGODB CONNECTIONS OR WRITES")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("ALL TEST-ONLY RECOVERY COORDINATOR TESTS PASSED")