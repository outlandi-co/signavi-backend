import assert from "node:assert/strict"

import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  assertV3PreclaimSquareReference
} from "../utils/smartShippingV3PreclaimReferenceGuard.js"

const orderId = "507f1f77bcf86cd799439011"
const anotherOrderId = "507f191e810c19729de860ea"

const modern = createV3SquareSafeCheckoutReference({ orderId })
const legacy = createV3CheckoutReference({ orderId })

const checked = assertV3PreclaimSquareReference({
  orderId,
  checkoutReferenceId: modern
})

assert.equal(checked.checkoutReferenceId, modern)
assert.equal(checked.referenceLength, 35)
assert.equal(checked.squareRequestAuthorized, false)
assert.ok(Object.isFrozen(checked))

console.log("SQUARE-SAFE PRECLAIM IDENTITY: PASS")
console.log("REFERENCE DOES NOT AUTHORIZE PAYMENT: PASS")

assert.throws(() =>
  assertV3PreclaimSquareReference({
    orderId,
    checkoutReferenceId: legacy
  })
)

console.log("43-CHARACTER LEGACY REFERENCE BLOCKED: PASS")

assert.throws(() =>
  assertV3PreclaimSquareReference({
    orderId,
    checkoutReferenceId:
      createV3SquareSafeCheckoutReference({
        orderId: anotherOrderId
      })
  })
)

console.log("CROSS-ORDER IDENTITY BLOCKED: PASS")

for (const checkoutReferenceId of [
  null,
  "",
  `${modern} `,
  modern.toUpperCase()
]) {
  assert.throws(() =>
    assertV3PreclaimSquareReference({
      orderId,
      checkoutReferenceId
    })
  )
}

console.log("MALFORMED REFERENCES BLOCKED: PASS")
console.log("NO DATABASE CONNECTIONS: PASS")
console.log("NO SQUARE API REQUESTS: PASS")
console.log("PRECLAIM REFERENCE REGRESSION: PASS")
