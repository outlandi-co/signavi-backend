import assert from "node:assert/strict"
import {
  claimV3ProductionCheckoutReservation
} from "../utils/claimV3ProductionCheckoutReservation.js"

const orderId = "507f1f77bcf86cd799439011"
const key = `signavi-v3-production-purchase-${orderId}`
const owner = "trusted-owner-001"

const input = {
  orderId,
  owner,
  amountCents: 2500
}

let stored = {
  environment: "production",
  orderId,
  purchaseKey: key,
  idempotencyKey: key,
  claimedByDocumentType: "order",
  claimedByDocumentId: orderId,
  status: "reserved",
  attemptClaimedAt: null,
  checkoutClaimOwner: null,
  checkoutClaimAmountCents: null
}

let writes = 0

const Reservation = {
  async findOneAndUpdate(filter, update, options) {
    assert.equal(options.returnDocument, "after")
    assert.equal(options.runValidators, true)
    assert.equal(filter.purchaseKey, key)
    assert.equal(filter.idempotencyKey, key)
    assert.equal(filter.status, "reserved")
    assert.equal(filter.attemptClaimedAt, null)
    assert.equal(filter.checkoutClaimOwner, null)

    if (stored.status !== "reserved" ||
        stored.attemptClaimedAt !== null ||
        stored.checkoutClaimOwner !== null) {
      return null
    }

    writes++
    stored = { ...stored, ...update.$set }
    return { ...stored }
  }
}

const first = await claimV3ProductionCheckoutReservation({
  Reservation,
  ...input
})

assert.equal(first.claimed, true)
assert.equal(first.owner, owner)
assert.equal(first.amountCents, 2500)
assert.equal(writes, 1)
console.log("PASS: first claim persists ownership and amount")

const duplicate = await claimV3ProductionCheckoutReservation({
  Reservation,
  ...input
})

assert.equal(duplicate.claimed, false)
assert.equal(writes, 1)
console.log("PASS: second claim rejected")

await assert.rejects(
  claimV3ProductionCheckoutReservation({
    Reservation,
    ...input,
    amountCents: -1
  }),
  /INVALID_CHECKOUT_CLAIM_IDENTITY/
)

assert.equal(writes, 1)
console.log("PASS: invalid amount rejected")

await assert.rejects(
  claimV3ProductionCheckoutReservation({
    Reservation,
    ...input,
    owner: ""
  }),
  /INVALID_CHECKOUT_CLAIM_IDENTITY/
)

assert.equal(writes, 1)
console.log("PASS: missing owner rejected")

console.log("CHECKOUT RESERVATION CLAIM: 4 TESTS PASSED")
console.log("IN-MEMORY MODEL ONLY")
console.log("NO REAL DATABASE WRITES")
console.log("NO SQUARE REQUESTS")