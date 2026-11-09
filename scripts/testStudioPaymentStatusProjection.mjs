import test from "node:test"
import assert from "node:assert/strict"
import {
  buildStudioPaymentStatusProjection
} from "../utils/buildStudioPaymentStatusProjection.mjs"

const attemptKey = "123e4567-e89b-42d3-a456-426614174000"

function studioOrder(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    storefront: "signavi_studio",
    storefrontCreationAttemptKey: attemptKey,
    paymentStatus: "paid",
    storefrontRecoveryProofHash: "private-proof",
    storefrontCreationFingerprint: "private-fingerprint",
    recoverySecret: "private-secret",
    squarePaymentId: "private-payment",
    email: "customer@example.invalid",
    shippingAddress: {
      street1: "Private address"
    },
    ...overrides
  }
}

test("returns only the three allowed fields", () => {
  const result = buildStudioPaymentStatusProjection(
    studioOrder(),
    attemptKey
  )

  assert.deepEqual(result, {
    orderId: "507f1f77bcf86cd799439011",
    storefront: "signavi_studio",
    paymentStatus: "paid"
  })

  assert.equal(Object.isFrozen(result), true)
})

test("supports unpaid status without claiming success", () => {
  const result = buildStudioPaymentStatusProjection(
    studioOrder({ paymentStatus: "unpaid" }),
    attemptKey
  )

  assert.equal(result.paymentStatus, "unpaid")
})

test("supports refunded status without claiming success", () => {
  const result = buildStudioPaymentStatusProjection(
    studioOrder({ paymentStatus: "refunded" }),
    attemptKey
  )

  assert.equal(result.paymentStatus, "refunded")
})

test("rejects Signavi Store orders", () => {
  assert.throws(
    () => buildStudioPaymentStatusProjection(
      studioOrder({ storefront: "signavi_store" }),
      attemptKey
    ),
    /PROJECTION_BLOCKED/
  )
})

test("rejects another checkout attempt", () => {
  assert.throws(
    () => buildStudioPaymentStatusProjection(
      studioOrder(),
      "123e4567-e89b-42d3-a456-426614174001"
    ),
    /PROJECTION_BLOCKED/
  )
})

test("rejects missing attempt association", () => {
  assert.throws(
    () => buildStudioPaymentStatusProjection(
      studioOrder({ storefrontCreationAttemptKey: undefined }),
      attemptKey
    ),
    /PROJECTION_BLOCKED/
  )
})

test("rejects invalid payment status", () => {
  assert.throws(
    () => buildStudioPaymentStatusProjection(
      studioOrder({ paymentStatus: "processing" }),
      attemptKey
    ),
    /PROJECTION_BLOCKED/
  )
})

test("rejects missing or malformed order IDs", () => {
  assert.throws(
    () => buildStudioPaymentStatusProjection(
      studioOrder({ _id: "invalid" }),
      attemptKey
    ),
    /PROJECTION_BLOCKED/
  )
})

test("never includes private order metadata", () => {
  const result = buildStudioPaymentStatusProjection(
    studioOrder(),
    attemptKey
  )

  const serialized = JSON.stringify(result)

  for (const secret of [
    "private-proof",
    "private-fingerprint",
    "private-secret",
    "private-payment",
    "customer@example.invalid",
    "Private address"
  ]) {
    assert.equal(serialized.includes(secret), false)
  }

  assert.equal(
    Object.hasOwn(result, "storefrontCreationAttemptKey"),
    false
  )
})