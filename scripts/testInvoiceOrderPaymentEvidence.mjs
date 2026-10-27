import assert from "node:assert/strict"
import mongoose from "mongoose"
import { validateInvoiceOrderPaymentEvidence as validate } from
  "../utils/validateInvoiceOrderPaymentEvidence.js"

const invoice = {
  _id: new mongoose.Types.ObjectId(),
  status: "draft",
  paymentStatus: "unpaid",
  finalProof: { approved: false }
}

const order = {
  _id: new mongoose.Types.ObjectId(),
  paymentStatus: "unpaid"
}

const empty = {
  invoice,
  order,
  paymentOperations: [],
  orderReservations: [],
  invoiceReservations: [],
  purchaseReservations: []
}

const eligible = validate(empty)

assert.equal(eligible.eligible, true)
assert.equal(eligible.squareRequestAuthorized, false)
assert.equal(eligible.purchaseKey, `order:${order._id}`)

for (const name of [
  "paymentOperations",
  "orderReservations",
  "invoiceReservations",
  "purchaseReservations"
]) {
  const incomplete = { ...empty }
  delete incomplete[name]

  assert.equal(validate(incomplete).eligible, false)
  assert.equal(
    validate(incomplete).reason,
    "payment_evidence_incomplete"
  )

  const active = {
    ...empty,
    [name]: [{ status: "reconciliation_required" }]
  }

  assert.equal(validate(active).eligible, false)
  assert.equal(
    validate(active).squareRequestAuthorized,
    false
  )
}

assert.equal(
  validate({
    ...empty,
    invoice: { ...invoice, paymentStatus: "paid" }
  }).eligible,
  false
)

assert.equal(
  validate({
    ...empty,
    order: { ...order, squarePaymentId: "existing-payment" }
  }).eligible,
  false
)

console.log("COMPLETE EMPTY PAYMENT EVIDENCE: ELIGIBLE")
console.log("MISSING PAYMENT EVIDENCE: BLOCKED")
console.log("EXISTING PAYMENT OPERATIONS: BLOCKED")
console.log("EXISTING RESERVATIONS: BLOCKED")
console.log("EXISTING PAYMENT HISTORY: BLOCKED")
console.log("SQUARE AUTHORIZATION: DISABLED")
console.log("PAYMENT EVIDENCE VALIDATOR PASSED")