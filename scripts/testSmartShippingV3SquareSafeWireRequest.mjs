import assert from "node:assert/strict"
import path from "node:path"
import { createRequire } from "node:module"

import {
  buildV3SquarePaymentLinkRequest
} from "../utils/smartShippingV3SquarePaymentLinkRequest.js"

import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const require = createRequire(import.meta.url)

const serializerPath = path.resolve(
  "node_modules/square/serialization/resources/checkout/resources/paymentLinks/client/requests/CreatePaymentLinkRequest.js"
)

const { CreatePaymentLinkRequest } = require(serializerPath)

const orderId = "507f1f77bcf86cd799439011"
const modern = createV3SquareSafeCheckoutReference({ orderId })
const legacy = createV3CheckoutReference({ orderId })

const request = buildV3SquarePaymentLinkRequest({
  orderId,
  amountCents: 100,
  idempotencyKey: "signavi-v3-sandbox-offline-wire-test",
  checkoutReferenceId: modern,
  locationId: "SYNTHETIC_SANDBOX_LOCATION",
  redirectUrl: `https://signavi.store/success/${orderId}`,
  referenceFormat: "square_safe"
})

const wire = CreatePaymentLinkRequest.jsonOrThrow(request, {
  unrecognizedObjectKeys: "strip",
  omitUndefined: true
})

assert.equal(wire.order.reference_id, modern)
assert.equal(wire.order.reference_id.length, 35)
assert.ok(wire.order.reference_id.length <= 40)
assert.notEqual(wire.order.reference_id, legacy)

console.log("SQUARE WIRE REFERENCE 35/40: PASS")

assert.equal(
  wire.order.location_id,
  "SYNTHETIC_SANDBOX_LOCATION"
)
assert.equal(
  String(wire.order.line_items[0].base_price_money.amount),
  "100"
)
assert.equal(
  wire.order.line_items[0].base_price_money.currency,
  "USD"
)
assert.equal(
  wire.checkout_options.ask_for_shipping_address,
  false
)

console.log("SQUARE WIRE ORDER FIELDS: PASS")

assert.equal(wire.order.referenceId, undefined)
assert.equal(wire.checkoutOptions, undefined)

console.log("SQUARE WIRE FIELD NAMES: PASS")
console.log("NO DATABASE CONNECTIONS: PASS")
console.log("NO SQUARE API REQUESTS: PASS")
console.log("SQUARE-SAFE WIRE CONTRACT: PASS")
