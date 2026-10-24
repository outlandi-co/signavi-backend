import assert from "node:assert/strict"
import {
  verifyV3SquarePaymentLink
} from "../utils/smartShippingV3SquareVerifier.js"

const valid = () => ({
  expectedPaymentLinkId: "sandbox-link-123",
  expectedAmountCents: 5528,
  paymentLink: {
    id: "sandbox-link-123",
    orderId: "sandbox-order-456",
    url: "https://square.link/u/example"
  },
  squareOrder: {
    id: "sandbox-order-456",
    totalMoney: {
      amount: 5528n,
      currency: "USD"
    }
  }
})

const result = verifyV3SquarePaymentLink(valid())

assert.equal(result.verified, true)
assert.equal(result.amountCents, 5528)
assert.equal(result.currency, "USD")
assert.equal(result.squarePaymentLinkId, "sandbox-link-123")
assert.equal(result.squareOrderId, "sandbox-order-456")

console.log("VALID SQUARE PAYMENT LINK: PASS")
console.log("BIGINT AMOUNT SUPPORT: PASS")

const reject = (label, change, pattern) => {
  const input = valid()
  change(input)

  assert.throws(
    () => verifyV3SquarePaymentLink(input),
    pattern
  )

  console.log(`${label}: PASS (rejected)`)
}

reject(
  "INCORRECT PAYMENT LINK ID",
  x => { x.paymentLink.id = "other-link" },
  /identity mismatch/
)

reject(
  "INCORRECT SQUARE ORDER",
  x => { x.squareOrder.id = "different-order" },
  /order identity mismatch/
)

reject(
  "CHANGED PAYMENT AMOUNT",
  x => { x.squareOrder.totalMoney.amount = 9999n },
  /amount or currency mismatch/
)

reject(
  "INCORRECT CURRENCY",
  x => { x.squareOrder.totalMoney.currency = "EUR" },
  /amount or currency mismatch/
)

reject(
  "INSECURE PAYMENT URL",
  x => { x.paymentLink.url = "http://square.link/u/example" },
  /Invalid Square payment-link URL/
)

reject(
  "MALFORMED PAYMENT URL",
  x => { x.paymentLink.url = "not-a-url" },
  /Invalid Square payment-link URL/
)

reject(
  "EMBEDDED URL CREDENTIALS",
  x => { x.paymentLink.url = "https://user:password@square.link/u/example" },
  /Invalid Square payment-link URL/
)

reject(
  "UNSAFE LARGE AMOUNT",
  x => { x.squareOrder.totalMoney.amount = 999999999999999999999n },
  /amount or currency mismatch/
)

reject(
  "MISSING SQUARE ORDER",
  x => { x.squareOrder = null },
  /order identity mismatch/
)

reject(
  "MISSING PAYMENT LINK",
  x => { x.paymentLink = null },
  /payment-link identity mismatch/
)

const snakeCase = valid()
snakeCase.squareOrder = {
  id: "sandbox-order-456",
  total_money: {
    amount: "5528",
    currency: "USD"
  }
}

assert.equal(
  verifyV3SquarePaymentLink(snakeCase).verified,
  true
)

console.log("SNAKE-CASE ORDER RESPONSE: PASS")
console.log("STRING AMOUNT SUPPORT: PASS")
console.log("ALL V3 SQUARE VERIFIER SECURITY TESTS PASSED")