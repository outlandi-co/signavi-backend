import assert from "node:assert/strict"
import { SquareEnvironment } from "square"
import {
  createV3SquareSandboxReader
} from "../utils/smartShippingV3SquareSandbox.js"
import {
  lookupV3SquarePaymentLink
} from "../utils/smartShippingV3SquareLookup.js"

const expected = {
  expectedPaymentLinkId: "sandbox-link-123",
  expectedAmountCents: 5528,
  expectedReferenceId: "signavi-v3-order-123"
}

const makeFixture = () => {
  const calls = {
    linkGet: 0,
    orderGet: 0,
    create: 0
  }

  const link = {
    id: "sandbox-link-123",
    orderId: "sandbox-order-456",
    url: "https://square.link/u/test123"
  }

  const order = {
    id: "sandbox-order-456",
    referenceId: "signavi-v3-order-123",
    totalMoney: {
      amount: 5528n,
      currency: "USD"
    }
  }

  class FakeSquareClient {
    constructor(options) {
      assert.equal(
        options.environment,
        SquareEnvironment.Sandbox
      )

      assert.equal(options.token, "sandbox-test-token")

      this.checkout = {
        paymentLinks: {
          get: async ({ id }) => {
            calls.linkGet++
            assert.equal(id, expected.expectedPaymentLinkId)
            return { paymentLink: link }
          },

          create: async () => {
            calls.create++
            throw new Error("FORBIDDEN: payment creation")
          }
        }
      }

      this.orders = {
        get: async ({ orderId }) => {
          calls.orderGet++
          assert.equal(orderId, link.orderId)
          return { order }
        }
      }
    }
  }

  const sandbox = createV3SquareSandboxReader({
    environment: "sandbox",
    token: "sandbox-test-token",
    locationId: "sandbox-location",
    Client: FakeSquareClient
  })

  return { calls, link, order, sandbox }
}

const good = makeFixture()

const verified = await lookupV3SquarePaymentLink({
  client: good.sandbox.client,
  ...expected
})

assert.equal(verified.verified, true)
assert.equal(verified.checkoutReferenceVerified, true)
assert.equal(verified.amountCents, 5528)
assert.equal(verified.squarePaymentLinkId, "sandbox-link-123")
assert.equal(verified.squareOrderId, "sandbox-order-456")
assert.equal(good.calls.linkGet, 1)
assert.equal(good.calls.orderGet, 1)
assert.equal(good.calls.create, 0)

console.log("SANDBOX READER + LOOKUP: PASS")
console.log("TRUSTED CHECKOUT ASSOCIATION: PASS")
console.log("PAYMENT AMOUNT AND IDS: PASS")

const reject = async (label, modify, pattern) => {
  const fixture = makeFixture()
  const input = {
    client: fixture.sandbox.client,
    ...expected
  }

  modify(fixture, input)

  await assert.rejects(
    lookupV3SquarePaymentLink(input),
    pattern
  )

  assert.equal(fixture.calls.create, 0)
  console.log(`${label}: PASS (rejected)`)
}

await reject(
  "OTHER CHECKOUT REFERENCE",
  f => { f.order.referenceId = "different-checkout" },
  /checkout reference mismatch/
)

await reject(
  "CHANGED PAYMENT TOTAL",
  f => { f.order.totalMoney.amount = 9999n },
  /amount or currency mismatch/
)

await reject(
  "WRONG SQUARE ORDER",
  f => { f.order.id = "other-square-order" },
  /order identity mismatch/
)

await reject(
  "UNTRUSTED PAYMENT URL",
  f => {
    f.link.url = "https://square.link.attacker.test/pay"
  },
  /Untrusted Square checkout URL/
)

await reject(
  "MISSING ORDER REFERENCE",
  f => { delete f.order.referenceId },
  /checkout reference mismatch/
)

await reject(
  "INCORRECT EXPECTED LINK",
  (f, input) => {
    input.expectedPaymentLinkId = "different-link"
  },
  /payment-link lookup mismatch|AssertionError/
)

const production = () => createV3SquareSandboxReader({
  environment: "production",
  token: "sandbox-test-token",
  locationId: "sandbox-location",
  Client: class {}
})

assert.throws(
  production,
  /requires sandbox environment/
)

console.log("PRODUCTION CONFIGURATION BLOCKED: PASS")

assert.equal(good.sandbox.client.checkout.paymentLinks.create, undefined)
assert.equal(good.sandbox.client.checkout.paymentLinks.list, undefined)
assert.equal(good.calls.create, 0)

console.log("PAYMENT CREATION UNAVAILABLE: PASS")
console.log("ALL V3 SANDBOX READER INTEGRATION TESTS PASSED")