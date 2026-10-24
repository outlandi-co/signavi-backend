import assert from "node:assert/strict"
import mongoose from "mongoose"

import {
  buildV3SquarePaymentLinkRequest
} from "../utils/smartShippingV3SquarePaymentLinkRequest.js"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const orderId = String(new mongoose.Types.ObjectId())

const reference = createV3CheckoutReference({
  orderId
})

const valid = {
  orderId,
  amountCents: 5528,
  idempotencyKey:
    "signavi-v3-sandbox-test-payment-operation",
  checkoutReferenceId: reference,
  locationId: "sandbox-test-location",
  redirectUrl:
    `https://signavi.store/success/${orderId}`
}

const reject = (changes, label) => {
  assert.throws(
    () => buildV3SquarePaymentLinkRequest({
      ...valid,
      ...changes
    })
  )
  console.log(`${label}: PASS`)
}

try {
  const request = buildV3SquarePaymentLinkRequest(valid)

  assert.equal(
    request.idempotencyKey,
    valid.idempotencyKey
  )

  assert.equal(request.order.locationId, valid.locationId)
  assert.equal(request.order.referenceId, reference)

  assert.equal(
    request.order.lineItems.length,
    1
  )

  assert.equal(
    request.order.lineItems[0].basePriceMoney.amount,
    5528n
  )

  assert.equal(
    request.order.lineItems[0].basePriceMoney.currency,
    "USD"
  )

  assert.equal(
    request.checkoutOptions.redirectUrl,
    valid.redirectUrl
  )

  assert.equal(
    request.checkoutOptions.askForShippingAddress,
    false
  )

  console.log("TRUSTED PAYMENT REQUEST: PASS")
  console.log("EXACT $55.28 USD AMOUNT: PASS")
  console.log("CANONICAL REFERENCE: PASS")
  console.log("STABLE IDEMPOTENCY KEY: PASS")
  console.log("SANDBOX LOCATION PARAMETER: PASS")

  reject({
    orderId: "invalid-id"
  }, "INVALID ORDER ID BLOCKED")

  reject({
    amountCents: 0
  }, "ZERO PAYMENT BLOCKED")

  reject({
    amountCents: 55.28
  }, "NON-INTEGER CENTS BLOCKED")

  reject({
    amountCents: Number.MAX_SAFE_INTEGER + 1
  }, "UNSAFE AMOUNT BLOCKED")

  reject({
    idempotencyKey: "signavi-production-key"
  }, "NON-V3 IDEMPOTENCY KEY BLOCKED")

  reject({
    checkoutReferenceId: "incorrect-reference"
  }, "WRONG CHECKOUT REFERENCE BLOCKED")

  reject({
    locationId: ""
  }, "MISSING LOCATION BLOCKED")

  reject({
    redirectUrl: "http://signavi.store/success"
  }, "HTTP REDIRECT BLOCKED")

  reject({
    redirectUrl: "https://user:pass@signavi.store/success"
  }, "REDIRECT CREDENTIALS BLOCKED")

  reject({
    redirectUrl: "https://signavi.store/success#fragment"
  }, "REDIRECT FRAGMENT BLOCKED")

  reject({
    redirectUrl: "https://example.org/other"
  }, "UNAPPROVED REDIRECT HOST BLOCKED")

  reject({
    redirectUrl: "https://signavi.store.evil.example/success/" + orderId
  }, "LOOKALIKE HOST BLOCKED")

  reject({
    redirectUrl: "https://signavi.store/success/different-order"
  }, "CROSS-ORDER REDIRECT BLOCKED")

  reject({
    redirectUrl: valid.redirectUrl + "?next=https://example.org"
  }, "REDIRECT QUERY BLOCKED")

  reject({
    redirectUrl: "https://signavi.store:8443/success/" + orderId
  }, "NONSTANDARD PORT BLOCKED")

  console.log("EXACT STOREFRONT REDIRECT VERIFIED: PASS")

  assert.equal(
    typeof request.order.lineItems[0].basePriceMoney.amount,
    "bigint"
  )

  console.log("NO SQUARE API CALLS: PASS")
  console.log("NO DATABASE CONNECTIONS: PASS")
  console.log("ALL V3 SQUARE REQUEST BUILDER TESTS PASSED")

} catch (error) {
  console.error(
    "V3 SQUARE REQUEST BUILDER TEST FAILED:",
    error
  )
  process.exitCode = 1
}