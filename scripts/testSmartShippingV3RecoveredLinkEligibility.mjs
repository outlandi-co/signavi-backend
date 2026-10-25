import assert from "node:assert/strict"
import {
  assessV3RecoveredLinkEligibility as assess
} from "../utils/smartShippingV3RecoveredLinkEligibility.js"

const id = "6addc6f674d8362634569095"
const linkId = "DZ25PZS3HYITVJOS"

const base = () => ({
  order: {
    _id: id,
    squareEnvironment: "sandbox",
    currency: "USD",
    status: "payment_required",
    paymentStatus: "unpaid",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: ""
  },
  operation: {
    orderId: id,
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: "test-owner",
    squareCreationAttemptClaimedAt: new Date(),
    amountCents: 100,
    idempotencyKey: "signavi-v3-sandbox-test",
    checkoutReferenceId: "signavi-v3-sandbox-test",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  },
  verified: {
    verified: true,
    checkoutReferenceVerified: true,
    amountCents: 100,
    squarePaymentLinkId: linkId,
    squareOrderId: "test-square-order",
    paymentUrl: "https://sandbox.square.link/u/test"
  },
  expectedPaymentLinkId: linkId
})

const success = assess(base())
assert.equal(success.eligible, true)
assert.equal(success.databaseWriteAuthorized, false)
assert.equal(success.squareCreationAuthorized, false)
assert.equal(success.claimResetAuthorized, false)
console.log("VERIFIED LINK CANDIDATE: PASS")

const cases = [
  ["PAID ORDER", x => { x.order.paymentStatus = "paid" }],
  ["WRONG ORDER", x => { x.order._id = "other-order" }],
  ["WRONG AMOUNT", x => { x.verified.amountCents = 200 }],
  ["WRONG REFERENCE", x => {
    x.verified.checkoutReferenceVerified = false
  }],
  ["WRONG LINK ID", x => {
    x.verified.squarePaymentLinkId = "different-link"
  }],
  ["CONFLICTING ORDER LINK", x => {
    x.order.squarePaymentLinkId = "different-link"
  }],
  ["CONFLICTING SQUARE ORDER", x => {
    x.order.squareOrderId = "different-square-order"
  }],
  ["UNCLAIMED OPERATION", x => {
    x.operation.squareCreationAttemptClaimedAt = null
  }],
  ["WRONG OWNER", x => { x.operation.requestOwner = "" }],
  ["WRONG STATE", x => { x.operation.status = "pending" }],
  ["WRONG ENVIRONMENT", x => {
    x.operation.environment = "production"
  }],
  ["UNTRUSTED URL", x => {
    x.verified.paymentUrl = "https://example.com/payment"
  }],
  ["EXISTING LINK", x => {
    x.operation.squarePaymentLinkId = linkId
  }]
]

for (const [name, modify] of cases) {
  const candidate = base()
  modify(candidate)

  const result = assess(candidate)
  assert.equal(result.eligible, false, name)
  assert.equal(result.databaseWriteAuthorized, false, name)
  assert.equal(result.squareCreationAuthorized, false, name)
  assert.equal(result.claimResetAuthorized, false, name)
  console.log(`${name}: REJECTED`)
}

console.log("14 RECOVERY ELIGIBILITY CASES: PASS")
console.log("NO DATABASE CONNECTION")
console.log("NO SQUARE REQUEST")
console.log("NO PAYMENT CLAIM RESET")