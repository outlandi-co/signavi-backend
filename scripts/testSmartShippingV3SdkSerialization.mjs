import assert from "node:assert/strict"
import { SquareClient, SquareEnvironment } from "square"

import {
  buildV3SquarePaymentLinkRequest
} from "../utils/smartShippingV3SquarePaymentLinkRequest.js"

const orderId = "507f1f77bcf86cd799439011"
const locationId = "mock-location"
const idempotencyKey = "signavi-v3-sandbox-serialization-test"

let calls = 0
let captured

const interceptedFetch = async (input, init) => {
  calls++

  const request = new Request(input, init)
  const url = new URL(request.url)

  assert.equal(url.hostname, "connect.squareupsandbox.com")
  assert.equal(request.method, "POST")
  assert.equal(url.pathname, "/v2/online-checkout/payment-links")

  const body = await request.json()
  captured = body

  assert.equal(body.idempotency_key, idempotencyKey)
  assert.equal(body.order.location_id, locationId)
  assert.equal(body.order.line_items[0].quantity, "1")
  assert.equal(
    body.order.line_items[0].base_price_money.amount,
    5528
  )
  assert.equal(
    body.order.line_items[0].base_price_money.currency,
    "USD"
  )

  console.log("SDK REQUEST SERIALIZATION: PASS")

  return new Response(
    JSON.stringify({
      payment_link: {
        id: "mock-link",
        order_id: "mock-order",
        url: "https://square.link/u/mock"
      }
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    }
  )
}

const client = new SquareClient({
  token: "dummy-offline-test-token",
  environment: SquareEnvironment.Sandbox,
  maxRetries: 0,
  fetch: interceptedFetch
})

const request = buildV3SquarePaymentLinkRequest({
  orderId,
  amountCents: 5528,
  idempotencyKey,
  checkoutReferenceId: `signavi-v3-sandbox-${orderId}`,
  locationId,
  redirectUrl: `https://signavi.store/success/${orderId}`
})

const response = await client.checkout.paymentLinks.create(
  request,
  { maxRetries: 0 }
)

assert.equal(calls, 1)
assert.equal(response.paymentLink.id, "mock-link")
assert.equal(response.paymentLink.orderId, "mock-order")
assert.equal(
  response.paymentLink.url,
  "https://square.link/u/mock"
)

assert.ok(captured)
console.log("SDK RESPONSE PARSING: PASS")
console.log("EXACTLY ONE INTERCEPTED HTTP REQUEST: PASS")
console.log("NO REAL SQUARE NETWORK REQUESTS: PASS")
console.log("ALL SDK SERIALIZATION TESTS PASSED")