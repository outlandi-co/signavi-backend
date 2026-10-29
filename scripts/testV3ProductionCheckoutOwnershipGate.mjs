import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"

import {
  verifyV3ProductionCheckoutOwnership as verify
} from "../utils/verifyV3ProductionCheckoutOwnership.js"

const orderId = "507f1f77bcf86cd799439011"
const owner = "checkout-owner-001"
const amountCents = 2500
const purchaseKey = `signavi-v3-production-purchase-${orderId}`
const squareIdempotencyKey =
  `sv3p-${createHash("sha256")
    .update(`square-link:production:${purchaseKey}`)
    .digest("hex")
    .slice(0, 40)}`

const reservation = {
  orderId, purchaseKey,
  idempotencyKey: purchaseKey,
  status: "claim_pending",
  checkoutClaimOwner: owner,
  checkoutClaimAmountCents: amountCents,
  attemptClaimedAt: new Date()
}

const operation = {
  orderId,
  idempotencyKey: purchaseKey,
  amountCents,
  status: "reconciliation_required",
  requestOwner: owner,
  squareIdempotencyKey,
  squareCreationAttemptClaimedAt: new Date(),
  squarePaymentLinkId: "",
  squareOrderId: "",
  paymentUrl: ""
}

function repositories(r = reservation, o = operation) {
  return {
    Reservation: {
      findOne: () => ({ lean: async () => r })
    },
    PaymentOperation: {
      findOne: () => ({ lean: async () => o })
    }
  }
}

const input = { orderId, owner, amountCents }

test("matching persisted ownership verified without Square permission", async () => {
  const result = await verify({
    ...repositories(), ...input
  })
  assert.equal(result.verified, true)
  assert.equal(result.squareIdempotencyKey, squareIdempotencyKey)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)
})

test("different checkout owner rejected", async () => {
  const result = await verify({
    ...repositories(), ...input, owner: "other-owner-001"
  })
  assert.equal(result.verified, false)
})

test("different Square key rejected", async () => {
  const result = await verify({
    ...repositories(
      reservation,
      { ...operation, squareIdempotencyKey: `sv3p-${"b".repeat(40)}` }
    ), ...input
  })
  assert.equal(result.verified, false)
})

test("missing reservation rejected", async () => {
  const result = await verify({
    ...repositories(null, operation), ...input
  })
  assert.equal(result.verified, false)
})

test("existing payment link rejected", async () => {
  const result = await verify({
    ...repositories(
      reservation,
      { ...operation, squarePaymentLinkId: "already-created" }
    ), ...input
  })
  assert.equal(result.verified, false)
})

test("database read uncertainty fails closed", async () => {
  const result = await verify({
    Reservation: {
      findOne: () => {
        throw new Error("DATABASE_UNAVAILABLE")
      }
    },
    PaymentOperation: {
      findOne: () => ({ lean: async () => operation })
    },
    ...input
  })
  assert.equal(result.verified, false)
  assert.equal(result.retryAuthorized, false)
})

test("invalid amount rejected", async () => {
  const result = await verify({
    ...repositories(), ...input, amountCents: 0
  })
  assert.equal(result.verified, false)
})