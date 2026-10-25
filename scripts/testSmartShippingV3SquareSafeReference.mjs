import assert from "node:assert/strict"
import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference,
  verifyV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const orderId = "507f1f77bcf86cd799439011"

const legacy = createV3CheckoutReference({ orderId })
const modern = createV3SquareSafeCheckoutReference({ orderId })

assert.equal(legacy, `signavi-v3-sandbox-${orderId}`)
assert.equal(modern, `signavi-v3-${orderId}`)

assert.equal(legacy.length, 43)
assert.equal(modern.length, 35)
assert.ok(modern.length <= 40)

assert.equal(
  verifyV3CheckoutReference({ orderId, referenceId: legacy }),
  true
)

assert.equal(
  verifyV3CheckoutReference({ orderId, referenceId: modern }),
  false
)

assert.notEqual(legacy, modern)

assert.throws(() =>
  createV3SquareSafeCheckoutReference({ orderId: "invalid" })
)

console.log("LEGACY FORMAT PRESERVED: PASS")
console.log("SQUARE-SAFE FORMAT 35/40: PASS")
console.log("LEGACY VERIFIER UNCHANGED: PASS")
console.log("NEW FORMAT NOT YET ACTIVATED: PASS")
console.log("INVALID ORDER REJECTED: PASS")
console.log("NO SQUARE REQUESTS OR DATABASE WRITES")
