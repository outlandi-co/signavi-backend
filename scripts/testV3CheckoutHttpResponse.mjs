
import test from "node:test"
import assert from "node:assert/strict"

import {
  createV3CheckoutHttpResponse
} from "../utils/createV3CheckoutHttpResponse.js"

const orderId = "aaaaaaaaaaaaaaaaaaaaaaaa"

test("verified handoff returns Square redirect response", () => {
  const response = createV3CheckoutHttpResponse({
    success: true,
    orderId,
    paymentUrl: "https://square.link/u/test"
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(response.body.orderId, orderId)
  assert.equal(response.body.paymentUrl, "https://square.link/u/test")
  assert.equal(response.body.paymentCompleted, false)
})

test("failed handoff preserves checkout lock", () => {
  const response = createV3CheckoutHttpResponse({
    success: false,
    reason: "PAYMENT_LINK_NOT_VERIFIED",
    httpStatus: 423
  })

  assert.equal(response.status, 423)
  assert.equal(response.body.success, false)
  assert.equal(response.body.retryAuthorized, false)
})

test("missing payment URL blocks redirect", () => {
  const response = createV3CheckoutHttpResponse({
    success: true,
    orderId
  })

  assert.equal(response.status, 423)
  assert.equal(response.body.success, false)
})

test("invalid order identity blocks redirect", () => {
  const response = createV3CheckoutHttpResponse({
    success: true,
    orderId: "invalid",
    paymentUrl: "https://square.link/u/test"
  })

  assert.equal(response.status, 423)
  assert.equal(response.body.success, false)
})

test("missing handoff fails closed", () => {
  const response = createV3CheckoutHttpResponse()

  assert.equal(response.status, 423)
  assert.equal(response.body.success, false)
})
