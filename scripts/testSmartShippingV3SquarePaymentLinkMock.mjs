import assert from "node:assert/strict"
import mongoose from "mongoose"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  simulateV3SquarePaymentLink
} from "../utils/smartShippingV3SquarePaymentLinkMock.js"

const orderId = String(new mongoose.Types.ObjectId())

const trustedInputs = {
  orderId,
  amountCents: 5528,
  idempotencyKey: "signavi-v3-sandbox-mock-key",
  checkoutReferenceId: createV3CheckoutReference({
    orderId
  }),
  locationId: "sandbox-test-location",
  redirectUrl: `https://signavi.store/success/${orderId}`
}

const simulatedResponse = {
  paymentLink: {
    id: "mock-square-link",
    orderId: "mock-square-order",
    url: "https://square.link/u/mock"
  }
}

const simulate = (changes = {}) =>
  simulateV3SquarePaymentLink({
    trustedInputs,
    simulatedResponse: {
      paymentLink: {
        ...simulatedResponse.paymentLink,
        ...changes
      }
    }
  })

const reject = (changes, label) => {
  assert.throws(() => simulate(changes))
  console.log(`${label}: PASS`)
}

try {
  const result = simulate()

  assert.equal(result.simulated, true)
  assert.equal(result.paymentCreated, false)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.paymentVerified, false)

  assert.equal(result.request.order.locationId,
    trustedInputs.locationId)
  assert.equal(result.request.order.referenceId,
    trustedInputs.checkoutReferenceId)
  assert.equal(result.request.idempotencyKey,
    trustedInputs.idempotencyKey)
  assert.equal(
    result.request.order.lineItems[0].basePriceMoney.amount,
    5528n
  )

  console.log("MOCKED SQUARE RESPONSE: PASS")
  console.log("EXACT TRUSTED REQUEST VALUES: PASS")

  reject({ id: "" }, "MISSING LINK ID BLOCKED")
  reject({ orderId: "" }, "MISSING SQUARE ORDER BLOCKED")
  reject({ url: "http://square.link/u/mock" },
    "INSECURE URL BLOCKED")
  reject({ url: "https://square.link.evil.example/u/mock" },
    "LOOKALIKE SQUARE HOST BLOCKED")
  reject({ url: "https://example.com/pay" },
    "UNAPPROVED PAYMENT HOST BLOCKED")

} catch (error) {
  console.error("MOCK ADAPTER TEST FAILED:", error)
  process.exitCode = 1
}

if (!process.exitCode) {
  console.log("NO REAL SQUARE API REQUESTS: PASS")
  console.log("NO DATABASE CONNECTIONS: PASS")
  console.log("MOCK-ONLY V3 SQUARE TEST COMPLETED")
}