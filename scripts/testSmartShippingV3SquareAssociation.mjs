import assert from "node:assert/strict"
import {
  verifyV3SquareCheckoutAssociation
} from "../utils/smartShippingV3SquareAssociation.js"

const valid = () => ({
  expectedPaymentLinkId: "sandbox-link-123",
  expectedAmountCents: 5528,
  expectedReferenceId: "signavi-v3-order-123",
  paymentLink: {
    id: "sandbox-link-123",
    orderId: "sandbox-order-456",
    url: "https://square.link/u/test123"
  },
  squareOrder: {
    id: "sandbox-order-456",
    referenceId: "signavi-v3-order-123",
    totalMoney: {
      amount: 5528n,
      currency: "USD"
    }
  }
})

const verified = verifyV3SquareCheckoutAssociation(valid())

assert.equal(verified.verified, true)
assert.equal(verified.checkoutReferenceVerified, true)
assert.equal(
  verified.checkoutReferenceId,
  "signavi-v3-order-123"
)
assert.equal(verified.amountCents, 5528)

console.log("TRUSTED CHECKOUT ASSOCIATION: PASS")

const reject = (label, change, pattern) => {
  const input = valid()
  change(input)

  assert.throws(
    () => verifyV3SquareCheckoutAssociation(input),
    pattern
  )

  console.log(`${label}: PASS (rejected)`)
}

reject(
  "DIFFERENT CHECKOUT REFERENCE",
  x => { x.squareOrder.referenceId = "another-order" },
  /checkout reference mismatch/
)

reject(
  "MISSING CHECKOUT REFERENCE",
  x => { delete x.squareOrder.referenceId },
  /checkout reference mismatch/
)

reject(
  "EMPTY TRUSTED REFERENCE",
  x => { x.expectedReferenceId = "" },
  /reference is required/
)

reject(
  "WHITESPACE TRUSTED REFERENCE",
  x => { x.expectedReferenceId = " signavi-v3-order-123 " },
  /reference is required/
)

reject(
  "ALTERED AMOUNT",
  x => { x.squareOrder.totalMoney.amount = 9999n },
  /amount or currency mismatch/
)

reject(
  "DIFFERENT PAYMENT LINK",
  x => { x.paymentLink.id = "another-link" },
  /payment-link identity mismatch/
)

reject(
  "LOOKALIKE HOSTNAME",
  x => { x.paymentLink.url = "https://square.link.attacker.test/u/123" },
  /Untrusted Square checkout URL/
)

reject(
  "UNRELATED HTTPS DOMAIN",
  x => { x.paymentLink.url = "https://example.com/pay" },
  /Untrusted Square checkout URL/
)

reject(
  "SQUARE SUBDOMAIN NOT ALLOWED",
  x => { x.paymentLink.url = "https://payments.square.link/u/123" },
  /Untrusted Square checkout URL/
)

reject(
  "NONSTANDARD PORT",
  x => { x.paymentLink.url = "https://square.link:8443/u/123" },
  /Untrusted Square checkout URL/
)

reject(
  "URL FRAGMENT",
  x => { x.paymentLink.url = "https://square.link/u/123#redirect" },
  /Untrusted Square checkout URL/
)

reject(
  "URL CREDENTIALS",
  x => { x.paymentLink.url = "https://user:secret@square.link/u/123" },
  /Invalid Square payment-link URL/
)

const secondHost = valid()
secondHost.paymentLink.url =
  "https://checkout.square.site/pay/test123"

assert.equal(
  verifyV3SquareCheckoutAssociation(secondHost)
    .checkoutReferenceVerified,
  true
)

console.log("SECOND APPROVED SQUARE HOST: PASS")

const snakeCase = valid()
delete snakeCase.squareOrder.referenceId
snakeCase.squareOrder.reference_id = "signavi-v3-order-123"

assert.equal(
  verifyV3SquareCheckoutAssociation(snakeCase)
    .checkoutReferenceVerified,
  true
)

console.log("SNAKE-CASE REFERENCE: PASS")
console.log("ALL V3 SQUARE ASSOCIATION TESTS PASSED")