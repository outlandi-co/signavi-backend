import assert from "node:assert/strict"

import {
  createV3ProductionOrderEvidenceReader
} from "../utils/createV3ProductionOrderEvidenceReader.js"

const originalEnv = process.env.NODE_ENV
const originalLocation =
  process.env.SQUARE_PRODUCTION_LOCATION_ID

const locationId = "synthetic-production-location"
const squareOrderId = "synthetic-square-order"
const paymentId = "synthetic-square-payment"

let orderReads = 0
let paymentReads = 0
let paymentCreates = 0

const goodOrder = {
  id: squareOrderId,
  locationId,
  referenceId: "synthetic-checkout-reference",
  tenders: [{ paymentId }]
}

const goodPayment = {
  id: paymentId,
  orderId: squareOrderId,
  locationId,
  status: "COMPLETED",
  amountMoney: {
    amount: 100n,
    currency: "USD"
  }
}

let currentOrder = goodOrder
let currentPayment = goodPayment
let orderError = false
let paymentError = false

const mockClient = {
  orders: {
    get: async (args, options) => {
      orderReads++

      assert.deepEqual(args, {
        orderId: squareOrderId
      })

      assert.equal(options.maxRetries, 0)

      if (orderError) {
        throw new Error("synthetic-order-error")
      }

      return { order: currentOrder }
    }
  },

  payments: {
    get: async (args, options) => {
      paymentReads++

      assert.deepEqual(args, { paymentId })
      assert.equal(options.maxRetries, 0)

      if (paymentError) {
        throw new Error("synthetic-payment-error")
      }

      return { payment: currentPayment }
    },

    create: async () => {
      paymentCreates++
      throw new Error("PAYMENT_CREATION_FORBIDDEN")
    }
  }
}

try {
  process.env.NODE_ENV = "test"
  process.env.SQUARE_PRODUCTION_LOCATION_ID =
    locationId

  const reader =
    createV3ProductionOrderEvidenceReader({
      testClient: mockClient
    })

  const result = await reader.readEvidence({
    squareOrderId
  })

  assert.equal(result.payment.id, paymentId)
  assert.equal(result.squareOrder.id, squareOrderId)
  assert.equal(orderReads, 1)
  assert.equal(paymentReads, 1)
  assert.equal(paymentCreates, 0)

  console.log("PASS: Payment ID resolved from Square order")

  await assert.rejects(
    reader.readEvidence({ squareOrderId: "" }),
    /SQUARE_ORDER_ID_REQUIRED/
  )

  assert.equal(orderReads, 1)

  console.log("PASS: Missing order ID rejected")

  currentOrder = {
    ...goodOrder,
    tenders: []
  }

  await assert.rejects(
    reader.readEvidence({ squareOrderId }),
    /SQUARE_PAYMENT_ID_UNRESOLVED/
  )

  console.log("PASS: Missing tender payment rejected")

  currentOrder = {
    ...goodOrder,
    tenders: [
      { paymentId },
      { paymentId: "another-payment" }
    ]
  }

  await assert.rejects(
    reader.readEvidence({ squareOrderId }),
    /SQUARE_PAYMENT_ID_UNRESOLVED/
  )

  console.log("PASS: Multiple tenders require reconciliation")

  currentOrder = {
    ...goodOrder,
    locationId: "wrong-location"
  }

  await assert.rejects(
    reader.readEvidence({ squareOrderId }),
    /SQUARE_ORDER_IDENTITY_MISMATCH/
  )

  console.log("PASS: Wrong order location rejected")

  currentOrder = goodOrder
  currentPayment = {
    ...goodPayment,
    orderId: "different-square-order"
  }

  await assert.rejects(
    reader.readEvidence({ squareOrderId }),
    /SQUARE_PAYMENT_IDENTITY_MISMATCH/
  )

  console.log("PASS: Payment-to-order mismatch rejected")

  currentPayment = {
    ...goodPayment,
    status: "PENDING"
  }

  await assert.rejects(
    reader.readEvidence({ squareOrderId }),
    /SQUARE_PAYMENT_NOT_COMPLETED/
  )

  console.log("PASS: Incomplete payment rejected")

  currentPayment = goodPayment
  orderError = true

  await assert.rejects(
    reader.readEvidence({ squareOrderId }),
    /SQUARE_ORDER_RETRIEVAL_FAILED/
  )

  orderError = false

  console.log("PASS: Order API failure rejected")

  paymentError = true

  await assert.rejects(
    reader.readEvidence({ squareOrderId }),
    /SQUARE_PAYMENT_RETRIEVAL_FAILED/
  )

  paymentError = false

  console.log("PASS: Payment API failure rejected")

  assert.equal(paymentCreates, 0)

  console.log("PASS: No payment creation")

  process.env.NODE_ENV = "production"

  assert.throws(
    () => createV3ProductionOrderEvidenceReader({
      testClient: mockClient
    }),
    /SQUARE_TEST_CLIENT_FORBIDDEN/
  )

  console.log("PASS: Test-client injection blocked in production")

  process.env.NODE_ENV = "test"

  console.log("")
  console.log("STEP 93 ORDER PAYMENT RESOLUTION: 11 CHECKS PASSED")
  console.log("SQUARE: MOCKED")
  console.log("DATABASE: NOT ACCESSED")
  console.log("NO LIVE SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")
} finally {
  process.env.NODE_ENV = originalEnv

  if (originalLocation === undefined) {
    delete process.env.SQUARE_PRODUCTION_LOCATION_ID
  } else {
    process.env.SQUARE_PRODUCTION_LOCATION_ID =
      originalLocation
  }
}
