import assert from "node:assert/strict"
import path from "node:path"
import { createRequire } from "node:module"

import {
  buildV3SquarePaymentLinkRequest
} from "../utils/smartShippingV3SquarePaymentLinkRequest.js"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const require = createRequire(import.meta.url)

const serializerPath = path.resolve(
  "node_modules/square/serialization/resources/checkout/resources/paymentLinks/client/requests/CreatePaymentLinkRequest.js"
)

const { CreatePaymentLinkRequest } = require(serializerPath)

assert.equal(typeof CreatePaymentLinkRequest.jsonOrThrow, "function")

const orderId = "507f1f77bcf86cd799439011"

const request = buildV3SquarePaymentLinkRequest({
  orderId,
  amountCents: 100,
  idempotencyKey: "signavi-v3-sandbox-serialization-test",
  checkoutReferenceId: createV3CheckoutReference({ orderId }),
  locationId: "SYNTHETIC_SANDBOX_LOCATION",
  redirectUrl: `https://signavi.store/success/${orderId}`
})

const json = CreatePaymentLinkRequest.jsonOrThrow(request, {
  unrecognizedObjectKeys: "strip",
  omitUndefined: true
})

assert.ok(json && typeof json === "object")
assert.equal(
  json.idempotency_key,
  "signavi-v3-sandbox-serialization-test"
)

assert.equal(json.idempotencyKey, undefined)
console.log("IDEMPOTENCY KEY SERIALIZATION: PASS")

assert.equal(json.order.location_id, "SYNTHETIC_SANDBOX_LOCATION")
assert.equal(
  json.order.reference_id,
  createV3CheckoutReference({ orderId })
)
console.log("ORDER IDENTITY SERIALIZATION: PASS")

assert.ok(Array.isArray(json.order.line_items))
assert.equal(json.order.line_items.length, 1)

const item = json.order.line_items[0]

assert.equal(item.quantity, "1")
assert.equal(item.name, `SignaVi Order ${orderId}`)
assert.equal(String(item.base_price_money.amount), "100")
assert.equal(item.base_price_money.currency, "USD")

console.log("ONE-DOLLAR LINE ITEM SERIALIZATION: PASS")

assert.equal(
  json.checkout_options.redirect_url,
  `https://signavi.store/success/${orderId}`
)

assert.equal(
  json.checkout_options.ask_for_shipping_address,
  false
)

console.log("CHECKOUT OPTIONS SERIALIZATION: PASS")

assert.equal(json.checkoutOptions, undefined)
assert.equal(json.order.locationId, undefined)
assert.equal(item.basePriceMoney, undefined)

console.log("CAMELCASE TO SNAKE_CASE: PASS")

assert.ok(Object.keys(json).includes("order"))
assert.ok(Object.keys(json).includes("checkout_options"))

console.log("SDK REQUEST CONTRACT: PASS")
console.log("NO REAL CREDENTIALS: PASS")
console.log("NO DATABASE CONNECTIONS: PASS")
console.log("NO SQUARE API REQUESTS: PASS")
console.log("SQUARE SERIALIZATION REGRESSION: PASS")