import assert from "node:assert/strict"
import mongoose from "mongoose"
import { validateInvoiceOrderCheckoutMatch as validate } from
  "../utils/validateInvoiceOrderCheckoutMatch.js"

const orderId = new mongoose.Types.ObjectId()

const invoice = {
  _id: new mongoose.Types.ObjectId(),
  customerEmail: "customer@example.com",
  total: 150,
  status: "draft",
  paymentStatus: "unpaid",
  finalProof: { approved: false }
}

const order = {
  _id: orderId,
  email: "CUSTOMER@example.com",
  paymentStatus: "unpaid"
}

const prepared = {
  orderId: String(orderId),
  subtotalCents: 12000,
  taxCents: 1000,
  shippingAmountCents: 2000,
  totalCents: 15000
}

const clean = { invoice, order, prepared }

const approved = validate(clean)

assert.equal(approved.eligible, true)
assert.equal(approved.amountCents, 15000)
assert.equal(approved.squareRequestAuthorized, false)

const cases = [
  {
    name: "CUSTOMER MISMATCH",
    input: {
      ...clean,
      invoice: {
        ...invoice,
        customerEmail: "another@example.com"
      }
    }
  },
  {
    name: "AMOUNT MISMATCH",
    input: {
      ...clean,
      invoice: { ...invoice, total: 151 }
    }
  },
  {
    name: "INVALID MONEY PRECISION",
    input: {
      ...clean,
      invoice: { ...invoice, total: 150.001 }
    }
  },
  {
    name: "WRONG ORDER",
    input: {
      ...clean,
      prepared: {
        ...prepared,
        orderId: String(new mongoose.Types.ObjectId())
      }
    }
  },
  {
    name: "MISSING PREPARATION",
    input: { ...clean, prepared: null }
  },
  {
    name: "INVALID TOTAL CENTS",
    input: {
      ...clean,
      prepared: { ...prepared, totalCents: 15000.5 }
    }
  },
  {
    name: "INVOICE PAYMENT HISTORY",
    input: {
      ...clean,
      invoice: { ...invoice, paymentStatus: "paid" }
    }
  }
]

for (const testCase of cases) {
  const result = validate(testCase.input)

  assert.equal(result.eligible, false, testCase.name)
  assert.equal(result.squareRequestAuthorized, false)

  console.log(`${testCase.name}: BLOCKED`)
}

console.log("MATCHED CUSTOMER AND TOTAL: ELIGIBLE")
console.log("SQUARE AUTHORIZATION: DISABLED")
console.log("CHECKOUT MATCH VALIDATOR PASSED")