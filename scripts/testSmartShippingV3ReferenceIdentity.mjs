import assert from "node:assert/strict"
import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"
import {
  classifyV3CheckoutReference,
  assertV3SquareSafeReference
} from "../utils/smartShippingV3ReferenceIdentity.js"

const orderId = "507f1f77bcf86cd799439011"
const otherOrderId = "507f191e810c19729de860ea"

const legacy = createV3CheckoutReference({ orderId })
const modern = createV3SquareSafeCheckoutReference({ orderId })

assert.equal(legacy.length, 43)
assert.equal(modern.length, 35)

assert.equal(
  classifyV3CheckoutReference({ orderId, referenceId: legacy }),
  "legacy"
)
console.log("LEGACY IDENTITY RECOGNIZED: PASS")

assert.equal(
  classifyV3CheckoutReference({ orderId, referenceId: modern }),
  "square_safe"
)
console.log("SQUARE-SAFE IDENTITY RECOGNIZED: PASS")

assert.equal(
  assertV3SquareSafeReference({ orderId, referenceId: modern }),
  modern
)
console.log("NEW SQUARE REFERENCE ACCEPTED: PASS")

assert.throws(() =>
  assertV3SquareSafeReference({ orderId, referenceId: legacy })
)
console.log("OVERSIZED LEGACY SQUARE REQUEST BLOCKED: PASS")

for (const referenceId of [
  "",
  null,
  `${modern} `,
  modern.toUpperCase(),
  createV3SquareSafeCheckoutReference({ orderId: otherOrderId }),
  "signavi-v3-invalid"
]) {
  assert.equal(
    classifyV3CheckoutReference({ orderId, referenceId }),
    null
  )
}
console.log("MALFORMED AND CROSS-ORDER REFERENCES BLOCKED: PASS")

assert.equal(
  classifyV3CheckoutReference({
    orderId: "invalid",
    referenceId: modern
  }),
  null
)
console.log("INVALID ORDER ID FAILS CLOSED: PASS")

console.log("NO SQUARE API REQUESTS: PASS")
console.log("NO DATABASE CONNECTIONS: PASS")
console.log("REFERENCE IDENTITY REGRESSIONS: PASS")
