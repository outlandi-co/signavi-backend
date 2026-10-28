import assert from "node:assert/strict"

import {
  recordV3ProductionPaymentIsolated
} from "../utils/recordV3ProductionPaymentIsolated.js"

process.env.NODE_ENV = "test"

const orderId = "507f191e810c19729de86111"
const otherId = "507f191e810c19729de86112"

const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

const baseReservation = {
  environment: "production",
  orderId,
  purchaseKey,
  idempotencyKey: purchaseKey,
  claimedByDocumentType: "order",
  claimedByDocumentId: orderId,
  status: "claim_pending",
  attemptClaimedAt: new Date()
}

const baseOperation = {
  environment: "production",
  orderId,
  idempotencyKey: purchaseKey,
  status: "completed",
  squareCreationAttemptClaimedAt: new Date()
}

let passed = 0

async function check(label, overrides, expectedReason) {
  let writes = 0
  let verifications = 0

  const reservation = {
    ...baseReservation,
    ...overrides
  }

  const result = await recordV3ProductionPaymentIsolated({
    orderId,

    Order: {
      findOne: async () => ({
        _id: orderId,
        squareEnvironment: "production",
        status: "payment_required",
        paymentStatus: "unpaid"
      }),
      findOneAndUpdate: async () => {
        writes++
        throw new Error("UNEXPECTED_DATABASE_WRITE")
      }
    },

    Reservation: {
      findOne: async () => reservation
    },

    PaymentOperation: {
      findOne: async () => baseOperation
    },

    verifyBinding: () => {
      verifications++
      return {
        bindingVerified: false
      }
    },

    payment: {
      id: "synthetic-payment"
    },

    squareOrder: {
      id: "synthetic-square-order"
    },

    expectedLocationId: "synthetic-location"
  })

  assert.equal(result.recorded, false)
  assert.equal(result.reason, expectedReason)
  assert.equal(result.squareCreationAuthorized, false)
  assert.equal(result.retryAuthorized, false)
  assert.equal(writes, 0)

  if (expectedReason === "CANONICAL_IDENTITY_MISMATCH") {
    assert.equal(verifications, 0)
  } else {
    assert.equal(verifications, 1)
  }

  passed++
  console.log(`PASS: ${label}`)
}

await check(
  "Correct order ownership reaches verification",
  {},
  "VERIFIED_BINDING_REQUIRED"
)

await check(
  "Different order owner blocked",
  { claimedByDocumentId: otherId },
  "CANONICAL_IDENTITY_MISMATCH"
)

await check(
  "Invoice-owned reservation blocked",
  {
    claimedByDocumentType: "invoice",
    claimedByDocumentId: otherId
  },
  "CANONICAL_IDENTITY_MISMATCH"
)

await check(
  "Missing owner blocked",
  { claimedByDocumentId: null },
  "CANONICAL_IDENTITY_MISMATCH"
)

await check(
  "Missing ownership type blocked",
  { claimedByDocumentType: undefined },
  "CANONICAL_IDENTITY_MISMATCH"
)

await check(
  "Incorrect purchase key blocked",
  { purchaseKey: `signavi-v3-production-purchase-${otherId}` },
  "CANONICAL_IDENTITY_MISMATCH"
)

console.log("")
console.log(`STEP 55 OWNERSHIP TESTS: ${passed} PASSED`)
console.log("NO DATABASE CONNECTIONS")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
