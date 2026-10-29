import assert from "node:assert/strict"

import {
  claimV3ProductionCheckoutReservation
} from "../utils/claimV3ProductionCheckoutReservation.js"

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

let state = {
  environment: "production",
  orderId,
  purchaseKey,
  idempotencyKey: purchaseKey,
  claimedByDocumentType: "order",
  claimedByDocumentId: orderId,
  status: "reserved",
  attemptClaimedAt: null,
  checkoutClaimOwner: null,
  checkoutClaimAmountCents: null
}

let mutations = 0

const Reservation = {
  async findOneAndUpdate(filter, update) {
    // No await between checking and updating in this
    // simulated atomic model.
    if (
      state.status !== filter.status ||
      state.attemptClaimedAt !== filter.attemptClaimedAt ||
      state.checkoutClaimOwner !== filter.checkoutClaimOwner
    ) {
      return null
    }

    mutations++
    state = { ...state, ...update.$set }

    return { ...state }
  }
}

const attempts = await Promise.all(
  Array.from({ length: 50 }, (_, index) =>
    claimV3ProductionCheckoutReservation({
      Reservation,
      orderId,
      amountCents: 2500,
      owner: `trusted-claim-${String(index).padStart(3, "0")}`
    })
  )
)

const winners = attempts.filter(x => x.claimed)
const blocked = attempts.filter(x => x.blocked)

assert.equal(winners.length, 1)
assert.equal(blocked.length, 49)
assert.equal(mutations, 1)

assert.equal(state.status, "claim_pending")
assert.equal(state.checkoutClaimAmountCents, 2500)
assert.equal(
  state.checkoutClaimOwner,
  winners[0].owner
)

console.log("PASS: 50 simulated concurrent claims")
console.log("PASS: 1 successful claim")
console.log("PASS: 49 blocked claims")
console.log("PASS: 1 state mutation")
console.log("NO REAL DATABASE WRITES")
console.log("NO SQUARE REQUESTS")