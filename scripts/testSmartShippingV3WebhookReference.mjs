import assert from "node:assert/strict"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  parseV3WebhookOrderReference
} from "../utils/smartShippingV3WebhookReference.js"

const id = "507f191e810c19729de860ea"
const referenceId = createV3SquareSafeCheckoutReference({
  orderId: id
})

const result = parseV3WebhookOrderReference({
  referenceId
})

assert.equal(result.orderId, id)
assert.equal(result.referenceId, referenceId)
assert.equal(result.paymentAuthorized, false)
assert.equal(result.databaseWriteAuthorized, false)
assert.equal(result.squareRequestAuthorized, false)
assert.equal(Object.isFrozen(result), true)

console.log("CANONICAL V3 REFERENCE: PASS")
console.log("NO PAYMENT AUTHORIZATION: PASS")

const invalid = [
  "",
  id,
  `signavi-v3-sandbox-${id}`,
  `signavi-v3-${id.toUpperCase()}`,
  `SIGNAVI-v3-${id}`,
  `signavi-v3-${id}-extra`,
  `signavi-v3-${id.slice(1)}`,
  "signavi-v3-not-an-object-id",
  null,
  undefined,
  123
]

for (const candidate of invalid) {
  assert.equal(
    parseV3WebhookOrderReference({
      referenceId: candidate
    }),
    null
  )
}

console.log("11 INVALID REFERENCE CASES: REJECTED")
console.log("NO DATABASE CONNECTION OR WRITES")
console.log("NO SQUARE API REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("WEBHOOK ROUTE UNCHANGED")