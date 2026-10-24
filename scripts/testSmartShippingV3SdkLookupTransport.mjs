import assert from "node:assert/strict"
import { SquareClient, SquareEnvironment } from "square"

const linkId = "mock-link-lookup"
const orderId = "mock-order-lookup"
const referenceId = "signavi-v3-sandbox-507f1f77bcf86cd799439011"
const locationId = "mock-location"

const seen = []

const interceptedFetch = async (input, init) => {
  const request = new Request(input, init)
  const url = new URL(request.url)

  assert.equal(url.hostname, "connect.squareupsandbox.com")
  assert.equal(request.method, "GET")

  seen.push(url.pathname)

  let result

  if (
    url.pathname ===
    `/v2/online-checkout/payment-links/${linkId}`
  ) {
    result = {
      payment_link: {
        id: linkId,
        order_id: orderId,
        url: "https://square.link/u/mock"
      }
    }
  } else if (url.pathname === `/v2/orders/${orderId}`) {
    result = {
      order: {
        id: orderId,
        reference_id: referenceId,
        location_id: locationId,
        total_money: {
          amount: 5528,
          currency: "USD"
        }
      }
    }
  } else {
    throw new Error(
      `Unexpected intercepted Square path: ${url.pathname}`
    )
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  })
}

const client = new SquareClient({
  token: "dummy-offline-lookup-test",
  environment: SquareEnvironment.Sandbox,
  maxRetries: 0,
  fetch: interceptedFetch
})

const link = await client.checkout.paymentLinks.get({
  id: linkId
})

assert.equal(link.paymentLink.id, linkId)
assert.equal(link.paymentLink.orderId, orderId)
assert.equal(
  link.paymentLink.url,
  "https://square.link/u/mock"
)

console.log("PAYMENT LINK GET AND DESERIALIZATION: PASS")

const order = await client.orders.get({
  orderId
})

assert.equal(order.order.id, orderId)
assert.equal(order.order.referenceId, referenceId)
assert.equal(order.order.locationId, locationId)
assert.equal(order.order.totalMoney.amount, 5528n)
assert.equal(order.order.totalMoney.currency, "USD")

console.log("ORDER GET AND MONEY DESERIALIZATION: PASS")

assert.deepEqual(seen, [
  `/v2/online-checkout/payment-links/${linkId}`,
  `/v2/orders/${orderId}`
])

console.log("EXACTLY TWO READ-ONLY REQUESTS: PASS")
console.log("NO REAL SQUARE REQUESTS: PASS")
console.log("ALL SDK LOOKUP TRANSPORT TESTS PASSED")

// Now exercise the independent V3 verifier against
// real SDK-deserialized responses, not hand-built
// objects returned directly by a mock client.
const { lookupV3SquarePaymentLink } = await import(
  "../utils/smartShippingV3SquareLookup.js"
)

seen.length = 0

const verified = await lookupV3SquarePaymentLink({
  client,
  expectedPaymentLinkId: linkId,
  expectedAmountCents: 5528,
  expectedReferenceId: referenceId,
  expectedLocationId: locationId
})

assert.equal(verified.squarePaymentLinkId, linkId)
assert.equal(verified.squareOrderId, orderId)
assert.equal(verified.amountCents, 5528)
assert.equal(verified.checkoutReferenceVerified, true)
assert.equal(verified.paymentUrl, "https://square.link/u/mock")

assert.deepEqual(seen, [
  `/v2/online-checkout/payment-links/${linkId}`,
  `/v2/orders/${orderId}`
])

console.log("V3 INDEPENDENT ASSOCIATION VERIFICATION: PASS")
console.log("V3 VERIFIED AMOUNT AND REFERENCE: PASS")
console.log("VERIFIER USES ONLY TWO READ-ONLY REQUESTS: PASS")
console.log("NO REAL SQUARE REQUESTS: PASS")
console.log("ALL SDK-TO-V3 VERIFICATION TESTS PASSED")