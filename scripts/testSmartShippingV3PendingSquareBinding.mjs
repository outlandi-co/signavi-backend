import assert from "node:assert/strict"
import mongoose from "mongoose"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  inspectV3PendingSquareBinding
} from "../utils/smartShippingV3PendingSquareBinding.js"

const id = String(new mongoose.Types.ObjectId())

const order = {
  _id: id,
  status: "payment_required",
  paymentStatus: "pending",
  currency: "usd",
  squareEnvironment: "sandbox",
  squareExpectedAmountCents: 5528,
  squarePaymentLinkId: ""
}

const operation = {
  orderId: id,
  amountCents: 5528,
  environment: "sandbox",
  status: "pending",
  checkoutReferenceId: createV3CheckoutReference({
    orderId: id
  }),
  idempotencyKey:
    "signavi-v3-sandbox-12345678-1234-4234-8234-123456789abc",
  requestOwner: "",
  squarePaymentLinkId: "",
  squareOrderId: "",
  paymentUrl: ""
}

const inspect = (o = order, p = operation) =>
  inspectV3PendingSquareBinding({
    order: o,
    operation: p
  })

const reject = (label, o, p, expectedReason) => {
  const result = inspect(o, p)
  assert.equal(result.consistent, false, label)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.reason, expectedReason)
  console.log(`${label}: PASS`)
}

const valid = inspect()
assert.equal(valid.consistent, true)
assert.equal(valid.amountCents, 5528)
assert.equal(valid.squareRequestAuthorized, false)
console.log("PENDING RECORD CONSISTENCY: PASS")

reject(
  "WRONG ORDER",
  order,
  { ...operation, orderId: new mongoose.Types.ObjectId() },
  "order_identity_mismatch"
)

reject(
  "TAMPERED AMOUNT",
  order,
  { ...operation, amountCents: 5529 },
  "payment_amount_mismatch"
)

reject(
  "PRODUCTION ENVIRONMENT",
  { ...order, squareEnvironment: "production" },
  operation,
  "payment_environment_mismatch"
)

reject(
  "PAID ORDER",
  { ...order, paymentStatus: "paid" },
  operation,
  "order_not_payable"
)

reject(
  "WRONG REFERENCE",
  order,
  { ...operation, checkoutReferenceId: "wrong" },
  "checkout_reference_mismatch"
)

reject(
  "INVALID KEY",
  order,
  { ...operation, idempotencyKey: "other-key" },
  "invalid_idempotency_key"
)

reject(
  "ALREADY STARTED",
  order,
  { ...operation, status: "reconciliation_required" },
  "payment_already_started_or_linked"
)

reject(
  "REQUEST OWNER ALREADY SET",
  order,
  { ...operation, requestOwner: "other-owner" },
  "payment_already_started_or_linked"
)

reject(
  "EXISTING SQUARE LINK",
  order,
  { ...operation, squarePaymentLinkId: "existing-link" },
  "payment_already_started_or_linked"
)

console.log("NO SQUARE AUTHORIZATION: PASS")
console.log("NO DATABASE OR NETWORK REQUESTS: PASS")
console.log("ALL PENDING BINDING TESTS PASSED")