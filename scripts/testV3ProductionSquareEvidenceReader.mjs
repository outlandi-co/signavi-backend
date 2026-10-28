import assert from "node:assert/strict"

import {
  createV3ProductionSquareEvidenceReader
} from "../utils/createV3ProductionSquareEvidenceReader.js"

process.env.NODE_ENV = "test"

const previousLocation =
  process.env.SQUARE_PRODUCTION_LOCATION_ID

const previousToken =
  process.env.SQUARE_PRODUCTION_ACCESS_TOKEN

const locationId = "test-production-location"
const paymentId = "synthetic-payment"
const squareOrderId = "synthetic-square-order"

let paymentCalls = 0
let orderCalls = 0
let createCalls = 0

const payment = {
  id: paymentId,
  orderId: squareOrderId,
  locationId,
  status: "COMPLETED",
  amountMoney: {
    amount: 100n,
    currency: "USD"
  }
}

const order = {
  id: squareOrderId,
  locationId,
  referenceId: "synthetic-reference"
}

let paymentResult = { payment }
let orderResult = { order }

const testClient = {
  payments: {
    get: async (args, options) => {
      paymentCalls++
      assert.deepEqual(args, { paymentId })
      assert.equal(options.maxRetries, 0)
      return paymentResult
    },

    create: async () => {
      createCalls++
      throw new Error("PAYMENT_CREATION_FORBIDDEN")
    }
  },

  orders: {
    get: async (args, options) => {
      orderCalls++
      assert.deepEqual(args, { orderId: squareOrderId })
      assert.equal(options.maxRetries, 0)
      return orderResult
    }
  }
}

try {
  process.env.SQUARE_PRODUCTION_LOCATION_ID =
    locationId

  delete process.env.SQUARE_PRODUCTION_ACCESS_TOKEN

  const reader =
    createV3ProductionSquareEvidenceReader({
      testClient
    })

  const result = await reader.readEvidence({
    paymentId,
    squareOrderId
  })

  assert.equal(result.payment.id, paymentId)
  assert.equal(result.squareOrder.id, squareOrderId)
  assert.equal(paymentCalls, 1)
  assert.equal(orderCalls, 1)
  assert.equal(createCalls, 0)

  console.log("PASS: Read payment and order through bound client")

  await assert.rejects(
    reader.readEvidence({
      paymentId: "",
      squareOrderId
    }),
    /SQUARE_EVIDENCE_IDS_REQUIRED/
  )

  assert.equal(paymentCalls, 1)

  console.log("PASS: Invalid IDs rejected before Square")

  paymentResult = {
    payment: {
      ...payment,
      id: "wrong-payment"
    }
  }

  await assert.rejects(
    reader.readEvidence({
      paymentId,
      squareOrderId
    }),
    /SQUARE_EVIDENCE_IDENTITY_MISMATCH/
  )

  console.log("PASS: Wrong payment identity rejected")

  paymentResult = {
    payment: {
      ...payment,
      locationId: "sandbox-location"
    }
  }

  await assert.rejects(
    reader.readEvidence({
      paymentId,
      squareOrderId
    }),
    /SQUARE_EVIDENCE_LOCATION_MISMATCH/
  )

  console.log("PASS: Wrong location rejected")

  paymentResult = {
    payment: {
      ...payment,
      status: "PENDING"
    }
  }

  await assert.rejects(
    reader.readEvidence({
      paymentId,
      squareOrderId
    }),
    /SQUARE_PAYMENT_NOT_COMPLETED/
  )

  console.log("PASS: Incomplete payment rejected")

  paymentResult = { payment }
  orderResult = { order: null }

  await assert.rejects(
    reader.readEvidence({
      paymentId,
      squareOrderId
    }),
    /SQUARE_EVIDENCE_MISSING/
  )

  console.log("PASS: Missing Square order rejected")

  orderResult = { order }

  paymentResult = null

  await assert.rejects(
    reader.readEvidence({
      paymentId,
      squareOrderId
    }),
    /SQUARE_EVIDENCE_MISSING/
  )

  console.log("PASS: Missing Square payment rejected")

  paymentResult = { payment }

  assert.equal(createCalls, 0)

  console.log("PASS: No payment creation method called")

  const before = process.env.NODE_ENV

  try {
    process.env.NODE_ENV = "production"

    assert.throws(
      () => createV3ProductionSquareEvidenceReader({
        testClient
      }),
      /SQUARE_TEST_CLIENT_FORBIDDEN/
    )
  } finally {
    process.env.NODE_ENV = before
  }

  console.log("PASS: Mock client injection blocked in production")

  delete process.env.SQUARE_PRODUCTION_LOCATION_ID

  assert.throws(
    () => createV3ProductionSquareEvidenceReader({
      testClient
    }),
    /SQUARE_PRODUCTION_LOCATION_REQUIRED/
  )

  console.log("PASS: Missing configured location rejected")

  console.log("")
  console.log("STEP 88 SQUARE EVIDENCE READER: 10 CHECKS PASSED")
  console.log("SQUARE: MOCKED")
  console.log("DATABASE: NOT ACCESSED")
  console.log("NO LIVE API REQUESTS")
  console.log("NO PAYMENT CREATION")
} finally {
  if (previousLocation === undefined) {
    delete process.env.SQUARE_PRODUCTION_LOCATION_ID
  } else {
    process.env.SQUARE_PRODUCTION_LOCATION_ID =
      previousLocation
  }

  if (previousToken === undefined) {
    delete process.env.SQUARE_PRODUCTION_ACCESS_TOKEN
  } else {
    process.env.SQUARE_PRODUCTION_ACCESS_TOKEN =
      previousToken
  }
}
