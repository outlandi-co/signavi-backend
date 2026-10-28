import assert from "node:assert/strict"

import {
  recordV3ProductionPaymentIsolated
} from "../utils/recordV3ProductionPaymentIsolated.js"

process.env.NODE_ENV = "test"

const orderId = "507f191e810c19729de86121"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

function fixture() {
  const order = {
    _id: orderId,
    squareEnvironment: "production",
    status: "payment_required",
    paymentStatus: "unpaid"
  }

  const reservation = {
    environment: "production",
    orderId,
    purchaseKey,
    idempotencyKey: purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    status: "claim_pending",
    attemptClaimedAt: new Date()
  }

  const operation = {
    environment: "production",
    orderId,
    idempotencyKey: purchaseKey,
    status: "completed",
    squareCreationAttemptClaimedAt: new Date()
  }

  return { order, reservation, operation }
}

let cases = 0

async function inspectDrift(label, mutate) {
  const state = fixture()

  let writes = 0

  const result = await recordV3ProductionPaymentIsolated({
    orderId,

    Order: {
      findOne: async () => ({ ...state.order }),

      findOneAndUpdate: async () => {
        writes++
        return {
          ...state.order,
          paymentStatus: "paid",
          status: "paid"
        }
      }
    },

    Reservation: {
      findOne: async () => ({ ...state.reservation })
    },

    PaymentOperation: {
      findOne: async () => ({ ...state.operation })
    },

    verifyBinding: () => {
      // Simulate another process modifying a durable record
      // after the initial reads and before the order update.
      mutate(state)

      return {
        bindingVerified: true,
        exactPaidReplay: false,
        orderId,
        squarePaymentId: "synthetic-payment",
        squareOrderId: "synthetic-square-order",
        amountCents: 100,
        environment: "production",
        databaseWriteAuthorized: false,
        paymentCreationAuthorized: false
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

  // This is a characterization test. It confirms whether
  // the current prototype can write using an outdated snapshot.
  assert.equal(writes, 1)
  assert.equal(result.recorded, true)

  cases++
  console.log(`RISK REPRODUCED: ${label}`)
}

await inspectDrift(
  "Reservation changes to reconciliation_required",
  state => {
    state.reservation.status = "reconciliation_required"
  }
)

await inspectDrift(
  "Reservation ownership changes",
  state => {
    state.reservation.claimedByDocumentId =
      "507f191e810c19729de86122"
  }
)

await inspectDrift(
  "Operation changes to reconciliation_required",
  state => {
    state.operation.status = "reconciliation_required"
  }
)

console.log("")
console.log(`STATE-DRIFT SCENARIOS CHARACTERIZED: ${cases}`)
console.log("WARNING: CURRENT TEST-ONLY RECORDER USES STALE SNAPSHOTS")
console.log("NEXT STEP: ADD CROSS-RECORD CONSISTENCY PROTECTION")
console.log("NO PRODUCTION DATABASE")
console.log("NO SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
