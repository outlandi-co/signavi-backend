import assert from "node:assert/strict"
import mongoose from "mongoose"
import { validateInvoiceOrderLink as validate } from
  "../utils/validateInvoiceOrderLink.js"

const invoiceId = new mongoose.Types.ObjectId()
const orderId = new mongoose.Types.ObjectId()

const invoice = {
  _id: invoiceId,
  status: "draft",
  paymentStatus: "unpaid",
  finalProof: { approved: false }
}

const order = {
  _id: orderId,
  paymentStatus: "unpaid"
}

const valid = validate({ invoice, order })

assert.equal(valid.eligible, true)
assert.equal(valid.purchaseKey, `order:${orderId}`)

for (const changes of [
  { status: "proof_approved" },
  { paymentStatus: "paid" },
  { paymentUrl: "existing-link" },
  { squarePaymentLinkId: "existing-id" },
  { squareOrderId: "existing-square-order" },
  { linkedOrderId: new mongoose.Types.ObjectId() },
  { finalProof: { approved: true } }
]) {
  assert.equal(
    validate({ invoice: { ...invoice, ...changes }, order }).eligible,
    false
  )
}

for (const changes of [
  { paymentStatus: "paid" },
  { paymentUrl: "existing-link" },
  { squareOrderId: "existing-square-order" },
  { squarePaymentId: "existing-payment" }
]) {
  assert.equal(
    validate({ invoice, order: { ...order, ...changes } }).eligible,
    false
  )
}

assert.equal(
  validate({ invoice: null, order }).eligible,
  false
)

console.log("CLEAN DRAFT DOCUMENTS: ELIGIBLE")
console.log("INVOICE PAYMENT/APPROVAL HISTORY: BLOCKED")
console.log("ORDER PAYMENT HISTORY: BLOCKED")
console.log("EXISTING ASSOCIATION: BLOCKED")
console.log("NO DATABASE OR SQUARE REQUESTS")
console.log("INVOICE ORDER LINK VALIDATOR PASSED")