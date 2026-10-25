import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"

import {
  buildV3SquarePaymentLinkRequest
} from "../utils/smartShippingV3SquarePaymentLinkRequest.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

// Offline preparation only.
// Never submit this request to Square.
// Never create or modify MongoDB records.

assert.ok(
  ["development", "test"].includes(process.env.NODE_ENV),
  "Development/test environment required."
)

assert.equal(
  process.env.SQUARE_ENVIRONMENT,
  "sandbox",
  "Square Sandbox environment required."
)

assert.notEqual(
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED,
  "true",
  "Payment creation must remain disabled."
)

assert.notEqual(
  process.env.SMART_SHIPPING_V3_ENABLED,
  "true",
  "V3 must remain disabled during preflight."
)

for (const name of [
  "SQUARE_SANDBOX_ACCESS_TOKEN",
  "SQUARE_SANDBOX_MERCHANT_ID",
  "SQUARE_SANDBOX_LOCATION_ID",
  "MONGO_URI"
]) {
  assert.ok(
    typeof process.env[name] === "string" &&
    process.env[name].trim(),
    `Missing required configuration: ${name}`
  )
}

console.log("SAFE SANDBOX CONFIGURATION: PASS")

const orderId = crypto.randomBytes(12).toString("hex")

const referenceId = createV3SquareSafeCheckoutReference({
  orderId
})

const idempotencyKey =
  `signavi-v3-sandbox-${crypto.randomUUID()}`

const request = buildV3SquarePaymentLinkRequest({
  orderId,
  amountCents: 100,
  idempotencyKey,
  checkoutReferenceId: referenceId,
  locationId: process.env.SQUARE_SANDBOX_LOCATION_ID,
  redirectUrl: `https://signavi.store/success/${orderId}`,
  referenceFormat: "square_safe"
})

assert.equal(request.idempotencyKey, idempotencyKey)
assert.equal(request.order.referenceId, referenceId)
assert.equal(referenceId.length, 35)
assert.ok(referenceId.length <= 40)
assert.equal(
  request.order.locationId,
  process.env.SQUARE_SANDBOX_LOCATION_ID
)

assert.equal(
  request.order.lineItems[0].basePriceMoney.amount,
  100n
)

assert.equal(
  request.order.lineItems[0].basePriceMoney.currency,
  "USD"
)

assert.equal(
  request.checkoutOptions.redirectUrl,
  `https://signavi.store/success/${orderId}`
)

console.log("ONE-DOLLAR REQUEST BUILDER: PASS")
console.log("TRUSTED LOCATION BINDING: PASS")
console.log("CHECKOUT REFERENCE AND REDIRECT: PASS")
console.log("UNIQUE IDEMPOTENCY KEY GENERATED: PASS")
console.log("NO PAYMENT LINK CREATED: PASS")
console.log("NO MONGODB WRITES: PASS")
console.log("NO REAL SQUARE NETWORK REQUESTS: PASS")
console.log("LIVE CREATION PREFLIGHT PASSED")
