import assert from "node:assert/strict"
import {
  lookupV3SquarePaymentLink
} from "../utils/smartShippingV3SquareLookup.js"

const makeFixture = () => {
  const calls = {
    linkGet: 0,
    orderGet: 0,
    create: 0
  }

  const link = {
    id: "sandbox-link-123",
    orderId: "sandbox-order-456",
    url: "https://square.link/u/example"
  }

  const order = {
    id: "sandbox-order-456",
    referenceId: "signavi-v3-order-123",
    locationId: "sandbox-location",
    totalMoney: {
      amount: 5528n,
      currency: "USD"
    }
  }

  const client = {
    checkout: {
      paymentLinks: {
        get: async ({ id }) => {
          calls.linkGet++
          assert.equal(id, "sandbox-link-123")
          return { paymentLink: link }
        },
        create: async () => {
          calls.create++
          throw new Error("FORBIDDEN: payment creation invoked")
        }
      }
    },
    orders: {
      get: async ({ orderId }) => {
        calls.orderGet++
        assert.equal(orderId, "sandbox-order-456")
        return { order }
      }
    }
  }

  return {
    calls,
    link,
    order,
    client,
    input: {
      client,
      expectedPaymentLinkId: "sandbox-link-123",
      expectedAmountCents: 5528,
      expectedReferenceId: "signavi-v3-order-123",
    expectedLocationId: "sandbox-location"
    }
  }
}

const good = makeFixture()
const verified = await lookupV3SquarePaymentLink(good.input)

assert.equal(verified.verified, true)
assert.equal(verified.checkoutReferenceVerified, true)
assert.equal(verified.amountCents, 5528)
assert.equal(verified.squarePaymentLinkId, "sandbox-link-123")
assert.equal(verified.squareOrderId, "sandbox-order-456")
assert.equal(good.calls.linkGet, 1)
assert.equal(good.calls.orderGet, 1)
assert.equal(good.calls.create, 0)

console.log("KNOWN PAYMENT LINK RETRIEVAL: PASS")
console.log("SQUARE ORDER RETRIEVAL: PASS")
console.log("CHECKOUT ASSOCIATION: PASS")

const reject = async (label, mutate, pattern, expectedOrderGets = 1) => {
  const fixture = makeFixture()
  mutate(fixture)

  await assert.rejects(
    lookupV3SquarePaymentLink(fixture.input),
    pattern
  )

  assert.equal(fixture.calls.create, 0)
  assert.equal(fixture.calls.orderGet, expectedOrderGets)

  console.log(`${label}: PASS (rejected)`)
}

await reject(
  "WRONG SQUARE LINK ID",
  f => { f.link.id = "another-link" },
  /payment-link lookup mismatch/,
  0
)

await reject(
  "WRONG CHECKOUT REFERENCE",
  f => { f.order.referenceId = "different-checkout" },
  /checkout reference mismatch/
)

await reject(
  "WRONG PAYMENT AMOUNT",
  f => { f.order.totalMoney.amount = 9999n },
  /amount or currency mismatch/
)

await reject(
  "WRONG CURRENCY",
  f => { f.order.totalMoney.currency = "EUR" },
  /amount or currency mismatch/
)

await reject(
  "WRONG SQUARE ORDER ID",
  f => { f.order.id = "different-order" },
  /order identity mismatch/
)

await reject(
  "UNTRUSTED PAYMENT URL",
  f => { f.link.url = "https://square.link.attacker.test/u/123" },
  /Untrusted Square checkout URL/
)

await reject(
  "MISSING LINK ORDER ID",
  f => { f.link.orderId = "" },
  /payment-link has no order/,
  0
)

await reject(
  "MISSING SQUARE ORDER",
  f => {
    f.client.orders.get = async () => {
      f.calls.orderGet++
      return {}
    }
  },
  /order location missing/
)

await reject(
  "SQUARE LINK API FAILURE",
  f => {
    f.client.checkout.paymentLinks.get = async () => {
      throw new Error("Simulated Square lookup outage")
    }
  },
  /Simulated Square lookup outage/,
  0
)

await reject(
  "SQUARE ORDER API FAILURE",
  f => {
    f.client.orders.get = async () => {
      f.calls.orderGet++
      throw new Error("Simulated Square order outage")
    }
  },
  /Simulated Square order outage/
)

await reject(
  "INVALID EXPECTED AMOUNT",
  f => { f.input.expectedAmountCents = -1 },
  /Invalid V3 Square lookup expectations/,
  0
)


await reject(
  "WRONG SQUARE LOCATION",
  f => { f.order.locationId = "other-sandbox-location" },
  /location mismatch/
)

await reject(
  "MISSING SQUARE LOCATION",
  f => { delete f.order.locationId },
  /location missing/
)


const missingTrustedLocation = makeFixture()
missingTrustedLocation.input.expectedLocationId = ""

await assert.rejects(
  lookupV3SquarePaymentLink(
    missingTrustedLocation.input
  ),
  /Invalid V3 Square lookup expectations/
)

assert.equal(missingTrustedLocation.calls.linkGet, 0)
assert.equal(missingTrustedLocation.calls.orderGet, 0)
assert.equal(missingTrustedLocation.calls.create, 0)

console.log("MISSING TRUSTED LOCATION: PASS (no lookup)")

await reject(
  "CONFLICTING SQUARE LOCATION FIELDS",
  f => {
    f.order.location_id = "another-location"
  },
  /location mismatch/
)

await reject(
  "REVERSED SQUARE LOCATION CONFLICT",
  f => {
    f.order.locationId = "another-location"
    f.order.location_id = "sandbox-location"
  },
  /location mismatch/
)

const snake = makeFixture()
snake.client.checkout.paymentLinks.get = async ({ id }) => {
  snake.calls.linkGet++
  assert.equal(id, "sandbox-link-123")
  return {
    payment_link: {
      id: snake.link.id,
      order_id: snake.link.orderId,
      url: snake.link.url
    }
  }
}

snake.order.reference_id = snake.order.referenceId
delete snake.order.referenceId

const snakeResult = await lookupV3SquarePaymentLink(snake.input)

assert.equal(snakeResult.checkoutReferenceVerified, true)
assert.equal(snake.calls.create, 0)

console.log("SNAKE-CASE SQUARE RESPONSE: PASS")
console.log("NO PAYMENT CREATION: PASS")
console.log("ALL V3 SQUARE LOOKUP TESTS PASSED")