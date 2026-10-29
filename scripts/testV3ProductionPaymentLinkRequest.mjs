import assert from "node:assert/strict"
import test from "node:test"

import {
  buildV3ProductionPaymentLinkRequest
} from "../utils/buildV3ProductionPaymentLinkRequest.js"

const orderId = "507f1f77bcf86cd799439011"

const valid = {
  orderId,
  purchaseKey:
    `signavi-v3-production-purchase-${orderId}`,
  amountCents: 2500,
  locationId: "TEST_LOCATION_001",
  redirectUrl:
    `https://signavi.store/success/${orderId}`
}

test("valid production request", () => {
  const result = buildV3ProductionPaymentLinkRequest(valid)

  assert.equal(result.order.locationId, valid.locationId)
  assert.equal(
    result.order.lineItems[0].basePriceMoney.amount,
    2500n
  )
  assert.equal(
    result.order.lineItems[0].basePriceMoney.currency,
    "USD"
  )
  assert.equal(
    result.checkoutOptions.redirectUrl,
    valid.redirectUrl
  )
})

test("production idempotency is deterministic and bounded", () => {
  const a = buildV3ProductionPaymentLinkRequest(valid)
  const b = buildV3ProductionPaymentLinkRequest(valid)

  assert.equal(a.idempotencyKey, b.idempotencyKey)
  assert.equal(a.idempotencyKey.length, 45)
  assert.match(a.idempotencyKey, /^sv3p-[a-f0-9]{40}$/)
})

test("different orders produce different identities", () => {
  const otherId = "507f1f77bcf86cd799439012"

  const other = buildV3ProductionPaymentLinkRequest({
    ...valid,
    orderId: otherId,
    purchaseKey:
      `signavi-v3-production-purchase-${otherId}`,
    redirectUrl:
      `https://signavi.store/success/${otherId}`
  })

  const first = buildV3ProductionPaymentLinkRequest(valid)

  assert.notEqual(first.idempotencyKey, other.idempotencyKey)
  assert.notEqual(first.order.referenceId, other.order.referenceId)
})

test("rejects incorrect purchase identity", () => {
  assert.throws(
    () => buildV3ProductionPaymentLinkRequest({
      ...valid,
      purchaseKey: "untrusted"
    }),
    /PRODUCTION_PURCHASE_IDENTITY_MISMATCH/
  )
})

test("rejects invalid amounts", () => {
  for (const amountCents of [0, -1, 2.5, NaN, Infinity]) {
    assert.throws(
      () => buildV3ProductionPaymentLinkRequest({
        ...valid,
        amountCents
      }),
      /INVALID_PRODUCTION_PAYMENT_AMOUNT/
    )
  }
})

test("rejects untrusted redirects", () => {
  for (const redirectUrl of [
    "http://signavi.store/success/" + orderId,
    "https://evil.example/success/" + orderId,
    "https://signavi.store/success/" + orderId + "?x=1",
    "https://signavi.store/success/" + orderId + "#test"
  ]) {
    assert.throws(
      () => buildV3ProductionPaymentLinkRequest({
        ...valid,
        redirectUrl
      }),
      /UNTRUSTED_PRODUCTION_REDIRECT/
    )
  }
})

test("rejects invalid location and order identity", () => {
  assert.throws(
    () => buildV3ProductionPaymentLinkRequest({
      ...valid,
      locationId: ""
    }),
    /INVALID_PRODUCTION_LOCATION/
  )

  assert.throws(
    () => buildV3ProductionPaymentLinkRequest({
      ...valid,
      orderId: "invalid"
    }),
    /INVALID_PRODUCTION_ORDER_ID/
  )
})

test("request construction never authorizes execution", () => {
  const request = buildV3ProductionPaymentLinkRequest(valid)

  assert.equal(request.squareRequestAuthorized, undefined)
  assert.equal(request.authorized, undefined)
  assert.equal(request.retryAuthorized, undefined)
})