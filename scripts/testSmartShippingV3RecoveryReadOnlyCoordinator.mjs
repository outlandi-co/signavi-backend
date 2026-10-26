import assert from "node:assert/strict"
import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"
import {
  inspectV3RecoveryReadOnly
} from "../utils/smartShippingV3RecoveryReadOnlyCoordinator.js"

const orderId = "507f191e810c19729de860ea"
const reference = createV3SquareSafeCheckoutReference({ orderId })

const counters = () => ({
  loads: 0,
  identities: 0,
  links: 0,
  orders: 0,
  creates: 0
})

const fixture = () => {
  const calls = counters()
  const order = {
    _id: orderId,
    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "sandbox",
    currency: "USD",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: ""
  }
  const operation = {
    orderId,
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: "synthetic-owner",
    squareCreationAttemptClaimedAt: new Date(),
    idempotencyKey: "signavi-v3-sandbox-synthetic",
    checkoutReferenceId: reference,
    amountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  }
  const link = {
    id: "synthetic-link",
    orderId: "synthetic-square-order",
    url: "https://sandbox.square.link/u/synthetic"
  }
  const squareOrder = {
    id: "synthetic-square-order",
    locationId: "synthetic-location",
    referenceId: reference,
    totalMoney: { amount: 100n, currency: "USD" }
  }
  const config = {
    orderId,
    expectedPaymentLinkId: "synthetic-link",
    expectedMerchantId: "synthetic-merchant",
    expectedLocationId: "synthetic-location",
    loadTrustedRecords: async () => {
      calls.loads++
      return { order, operation }
    },
    verifyTrustedIdentity: async () => {
      calls.identities++
      return {
        verified: true,
        merchantId: "synthetic-merchant",
        locationId: "synthetic-location",
        currency: "USD"
      }
    },
    lookupClient: {
      checkout: {
        paymentLinks: {
          get: async () => {
            calls.links++
            return { paymentLink: link }
          },
          create: async () => {
            calls.creates++
            throw new Error("Square creation forbidden")
          }
        }
      },
      orders: {
        get: async () => {
          calls.orders++
          return { order: squareOrder }
        }
      }
    }
  }
  return { calls, config, order, operation, link, squareOrder }
}

const good = fixture()
const result = await inspectV3RecoveryReadOnly(good.config)

assert.equal(result.eligibleForFurtherReview, true)
assert.equal(result.databaseWriteAuthorized, false)
assert.equal(result.squareCreationAuthorized, false)
assert.equal(result.claimResetAuthorized, false)
assert.equal(result.customerPaymentConfirmed, false)
assert.equal(result.paymentLinkRecorded, false)
assert.equal(good.calls.loads, 1)
assert.equal(good.calls.identities, 1)
assert.equal(good.calls.links, 1)
assert.equal(good.calls.orders, 1)
assert.equal(good.calls.creates, 0)
console.log("READ-ONLY COORDINATOR POSITIVE PATH: PASS")

const bad = [
  ["wrong order", f => { f.order._id = "507f191e810c19729de860eb" }, 0, 0],
  ["paid order", f => { f.order.paymentStatus = "paid" }, 0, 0],
  ["wrong reference", f => { f.operation.checkoutReferenceId = "wrong" }, 0, 0],
  ["wrong operation state", f => { f.operation.status = "completed" }, 0, 0],
  ["merchant mismatch", f => { f.config.expectedMerchantId = "other" }, 1, 0],
  ["location mismatch", f => { f.config.expectedLocationId = "other" }, 1, 0],
  ["wrong Square amount", f => { f.squareOrder.totalMoney.amount = 200n }, 1, 1],
  ["wrong Square reference", f => { f.squareOrder.referenceId = "wrong" }, 1, 1]
]

for (const [name, mutate, identities, links] of bad) {
  const f = fixture()
  mutate(f)
  await assert.rejects(inspectV3RecoveryReadOnly(f.config), name)
  assert.equal(f.calls.identities, identities, name)
  assert.equal(f.calls.links, links, name)
  assert.equal(f.calls.creates, 0, name)
  console.log(`${name.toUpperCase()}: REJECTED`)
}

const invalid = fixture()
invalid.config.orderId = "not-an-object-id"
await assert.rejects(
  inspectV3RecoveryReadOnly(invalid.config),
  /configuration rejected/
)
assert.equal(invalid.calls.loads, 0)
assert.equal(invalid.calls.identities, 0)
assert.equal(invalid.calls.links, 0)
console.log("INVALID ID FAILS BEFORE RECORD ACCESS: PASS")

console.log("NO DATABASE CONNECTION OR WRITES")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO SQUARE CREATION")
console.log("NO CLAIM RESET")