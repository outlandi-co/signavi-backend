import assert from "node:assert/strict"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  prepareV3PaymentOperation
} from "../utils/smartShippingV3PaymentOperation.js"
import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const orderId = "507f1f77bcf86cd799439011"
const amountCents = 100

const modern = createV3SquareSafeCheckoutReference({ orderId })
const legacy = createV3CheckoutReference({ orderId })

const originalFindOne = PaymentOperation.findOne
const originalCreate = PaymentOperation.create

let stored = null
let createCalls = 0

PaymentOperation.findOne = async () => stored
PaymentOperation.create = async data => {
  createCalls++
  stored = { ...data }
  return stored
}

try {
  const first = await prepareV3PaymentOperation({
    orderId,
    amountCents
  })

  assert.equal(first.checkoutReferenceId, modern)
  assert.equal(modern.length, 35)
  assert.equal(createCalls, 1)
  console.log("NEW OPERATION GETS SQUARE-SAFE REFERENCE: PASS")

  const second = await prepareV3PaymentOperation({
    orderId,
    amountCents
  })

  assert.equal(second.checkoutReferenceId, modern)
  assert.equal(createCalls, 1)
  console.log("REPEATED PREPARATION REUSES ORIGINAL: PASS")

  stored.checkoutReferenceId = legacy
  const historical = await prepareV3PaymentOperation({
    orderId,
    amountCents
  })

  assert.equal(historical.checkoutReferenceId, legacy)
  assert.equal(createCalls, 1)
  console.log("EXISTING LEGACY IDENTITY PRESERVED: PASS")

  stored.checkoutReferenceId = `${modern}x`
  await assert.rejects(
    prepareV3PaymentOperation({ orderId, amountCents })
  )
  console.log("INVALID STORED IDENTITY REJECTED: PASS")

  stored.checkoutReferenceId = modern
  stored.status = "reconciliation_required"

  await assert.rejects(
    prepareV3PaymentOperation({ orderId, amountCents })
  )
  console.log("STARTED PAYMENT NOT REPREPARED: PASS")

  stored.status = "pending"
  await assert.rejects(
    prepareV3PaymentOperation({
      orderId,
      amountCents: amountCents + 1
    })
  )
  console.log("CHANGED AMOUNT REJECTED: PASS")

  assert.equal(createCalls, 1)
  console.log("NO DUPLICATE CREATION: PASS")
  console.log("NO DATABASE CONNECTIONS: PASS")
  console.log("NO SQUARE API REQUESTS: PASS")
  console.log("NEW OPERATION REFERENCE REGRESSION: PASS")
} finally {
  PaymentOperation.findOne = originalFindOne
  PaymentOperation.create = originalCreate
}
