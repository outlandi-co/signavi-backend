import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import {
  recordV3ProductionCheckoutLink
} from "../utils/recordV3ProductionCheckoutLink.js"

const orderId = "507f1f77bcf86cd799439011"
const key = `signavi-v3-production-purchase-${orderId}`
const owner = "trusted-owner-001"
let writes = 0

const args = {
  orderId,
  owner,
  amountCents: 2500,
  paymentLinkId: "square-link-1",
  squareOrderId: "square-order-1",
  paymentUrl: "https://square.example/checkout"
}

const reservation = {
  environment: "production",
  orderId,
  purchaseKey: key,
  idempotencyKey: key,
  status: "claim_pending",
  checkoutClaimOwner: owner,
  checkoutClaimAmountCents: 2500,
  attemptClaimedAt: new Date()
}

const squareIdempotencyKey =
  `sv3p-${createHash("sha256")
    .update(`square-link:production:${key}`)
    .digest("hex")
    .slice(0, 40)}`
let operation = {
  environment: "production",
  orderId,
  idempotencyKey: key,
  squareIdempotencyKey,
  requestOwner: owner,
  amountCents: 2500,
  status: "reconciliation_required",
  squareCreationAttemptClaimedAt: new Date(),
  squarePaymentLinkId: "",
  squareOrderId: "",
  paymentUrl: ""
}

const Reservation = {
  findOne(query) {
    assert.equal(query.checkoutClaimOwner, owner)
    assert.equal(query.checkoutClaimAmountCents, 2500)
    assert.equal(query.purchaseKey, key)
    return { lean: async () => ({ ...reservation }) }
  }
}

const PaymentOperation = {
  async findOneAndUpdate(filter, update, options) {
    assert.equal(options.returnDocument, "after")
    assert.equal(options.runValidators, true)
    assert.equal(filter.idempotencyKey, key)
    assert.equal(filter.amountCents, 2500)

    if (
      operation.squareIdempotencyKey !== filter.squareIdempotencyKey ||
      operation.requestOwner !== filter.requestOwner ||
      operation.status !== filter.status ||
      operation.squarePaymentLinkId !== filter.squarePaymentLinkId ||
      operation.squareOrderId !== filter.squareOrderId ||
      operation.paymentUrl !== filter.paymentUrl
    ) {
      return null
    }

    writes++
    operation = { ...operation, ...update.$set }
    return { ...operation }
  }
}

const originalSquareKey = operation.squareIdempotencyKey

operation.squareIdempotencyKey = `sv3p-${"b".repeat(40)}`

const wrongKey = await recordV3ProductionCheckoutLink({
  Reservation, PaymentOperation, ...args
})

assert.equal(wrongKey.recorded, false)
assert.equal(writes, 0)
console.log("PASS: wrong persisted Square key blocked")

operation.squareIdempotencyKey = originalSquareKey
operation.requestOwner = "different-operation-owner"

const wrongOperationOwner = await recordV3ProductionCheckoutLink({
  Reservation, PaymentOperation, ...args
})

assert.equal(wrongOperationOwner.recorded, false)
assert.equal(writes, 0)
console.log("PASS: wrong operation owner blocked")

operation.requestOwner = owner
const first = await recordV3ProductionCheckoutLink({
  Reservation, PaymentOperation, ...args
})

assert.equal(first.recorded, true)
assert.equal(writes, 1)
assert.equal(operation.status, "reconciliation_required")
console.log("PASS: link recorded without marking payment paid")

const duplicate = await recordV3ProductionCheckoutLink({
  Reservation, PaymentOperation, ...args
})

assert.equal(duplicate.recorded, false)
assert.equal(writes, 1)
console.log("PASS: repeated link recording blocked")

const mismatch = await recordV3ProductionCheckoutLink({
  Reservation, PaymentOperation,
  ...args,
  owner: "different-owner"
})

assert.equal(mismatch.recorded, false)
assert.equal(writes, 1)
console.log("PASS: mismatched owner blocked")

const invalid = await recordV3ProductionCheckoutLink({
  Reservation, PaymentOperation,
  ...args,
  amountCents: -1
})

assert.equal(invalid.recorded, false)
assert.equal(writes, 1)
console.log("PASS: invalid amount blocked")

const failingOperation = {
  async findOneAndUpdate() {
    throw new Error("Simulated database timeout")
  }
}

const uncertain = await recordV3ProductionCheckoutLink({
  Reservation,
  PaymentOperation: failingOperation,
  ...args
})

assert.equal(uncertain.recorded, false)
assert.equal(
  uncertain.reason,
  "LINK_RECORDING_OUTCOME_UNCERTAIN"
)
console.log("PASS: database timeout remains uncertain")

console.log("CHECKOUT LINK RECORDING: 5 TESTS PASSED")
console.log("IN-MEMORY REPOSITORIES ONLY")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO DATABASE WRITES")