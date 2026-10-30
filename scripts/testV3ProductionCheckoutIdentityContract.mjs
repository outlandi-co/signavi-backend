import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveV3ProductionCheckoutIdentity
} from "../utils/resolveV3ProductionCheckoutIdentity.js"

import {
  buildV3ProductionPaymentLinkRequest
} from "../utils/buildV3ProductionPaymentLinkRequest.js"

const id = "507f1f77bcf86cd799439011"

function identity() {
  return resolveV3ProductionCheckoutIdentity({
    orderId: id
  })
}

test("production identity is deterministic", () => {
  assert.deepEqual(identity(), identity())
  assert.equal(Object.isFrozen(identity()), true)
})

test("production reference differs from sandbox references", () => {
  const result = identity()

  assert.equal(
    result.squareOrderReferenceId,
    `SV3-${id}`
  )

  assert.notEqual(
    result.squareOrderReferenceId,
    `signavi-v3-${id}`
  )

  assert.notEqual(
    result.squareOrderReferenceId,
    `signavi-v3-sandbox-${id}`
  )
})

test("production purchase key is server-derived", () => {
  assert.equal(
    identity().purchaseKey,
    `signavi-v3-production-purchase-${id}`
  )
})

test("invalid order identities are rejected", () => {
  for (const invalid of [
    undefined,
    null,
    "",
    "123",
    "../unsafe",
    id.toUpperCase(),
    `${id}0`
  ]) {
    assert.throws(
      () => resolveV3ProductionCheckoutIdentity({
        orderId: invalid
      }),
      /INVALID_PRODUCTION_ORDER_ID/
    )
  }
})

test("identity matches existing Square request builder", () => {
  const expected = identity()

  const request = buildV3ProductionPaymentLinkRequest({
    orderId: id,
    purchaseKey: expected.purchaseKey,
    amountCents: 1234,
    locationId: "TEST_LOCATION",
    redirectUrl: `https://signavi.store/success/${id}`
  })

  assert.equal(
    request.order.referenceId,
    expected.squareOrderReferenceId
  )

  assert.equal(
    request.order.locationId,
    "TEST_LOCATION"
  )

  assert.ok(
    typeof request.idempotencyKey === "string"
  )
})

console.log("TEST ONLY: NO SQUARE CALLS OR DB ACCESS")