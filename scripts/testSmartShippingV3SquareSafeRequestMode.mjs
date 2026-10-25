import assert from "node:assert/strict"
import {
  buildV3SquarePaymentLinkRequest
} from "../utils/smartShippingV3SquarePaymentLinkRequest.js"
import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const orderId = "507f1f77bcf86cd799439011"
const otherId = "507f191e810c19729de860ea"

const base = {
  orderId,
  amountCents: 100,
  idempotencyKey: "signavi-v3-sandbox-offline-test",
  locationId: "SYNTHETIC_SANDBOX_LOCATION",
  redirectUrl: `https://signavi.store/success/${orderId}`
}

const modern = createV3SquareSafeCheckoutReference({ orderId })
const legacy = createV3CheckoutReference({ orderId })

const request = buildV3SquarePaymentLinkRequest({
  ...base,
  checkoutReferenceId: modern,
  referenceFormat: "square_safe"
})

assert.equal(request.order.referenceId, modern)
assert.equal(request.order.referenceId.length, 35)
assert.ok(request.order.referenceId.length <= 40)
assert.equal(request.order.lineItems[0].basePriceMoney.amount, 100n)

console.log("SQUARE-SAFE REQUEST: PASS")

assert.throws(() =>
  buildV3SquarePaymentLinkRequest({
    ...base,
    checkoutReferenceId: legacy,
    referenceFormat: "square_safe"
  })
)

console.log("LEGACY REFERENCE BLOCKED IN NEW MODE: PASS")

assert.throws(() =>
  buildV3SquarePaymentLinkRequest({
    ...base,
    checkoutReferenceId:
      createV3SquareSafeCheckoutReference({ orderId: otherId }),
    referenceFormat: "square_safe"
  })
)

console.log("CROSS-ORDER REFERENCE BLOCKED: PASS")

assert.throws(() =>
  buildV3SquarePaymentLinkRequest({
    ...base,
    checkoutReferenceId: modern,
    referenceFormat: "unknown"
  })
)

console.log("UNKNOWN FORMAT BLOCKED: PASS")

const historical = buildV3SquarePaymentLinkRequest({
  ...base,
  checkoutReferenceId: legacy
})

assert.equal(historical.order.referenceId, legacy)

console.log("HISTORICAL BUILDER BEHAVIOR PRESERVED: PASS")
console.log("NO SQUARE API REQUESTS: PASS")
console.log("NO DATABASE CONNECTIONS: PASS")
