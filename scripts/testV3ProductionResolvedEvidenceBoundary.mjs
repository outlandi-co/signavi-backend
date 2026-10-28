import assert from "node:assert/strict"

import {
  createV3ProductionResolvedEvidenceBoundaryIsolated
} from "../utils/createV3ProductionResolvedEvidenceBoundaryIsolated.js"

const previousMode = process.env.NODE_ENV
const previousLocation = process.env.SQUARE_PRODUCTION_LOCATION_ID

const id = "507f191e810c19729de87001"
const squareOrderId = "stored-square-order"
const paymentId = "square-derived-payment"
const locationId = "server-production-location"

let orderReads = 0
let paymentReads = 0
let paymentCreates = 0
let attackerCalls = 0
let transactionStarts = 0
let writes = 0

let orderResponse = {
  order: {
    id: squareOrderId,
    locationId,
    tenders: [{ paymentId }]
  }
}

let paymentResponse = {
  payment: {
    id: paymentId,
    orderId: squareOrderId,
    locationId,
    status: "COMPLETED"
  }
}

const client = {
  orders: {
    get: async ({ orderId }, options) => {
      orderReads++
      assert.equal(orderId, squareOrderId)
      assert.equal(options.maxRetries, 0)
      return orderResponse
    }
  },
  payments: {
    get: async ({ paymentId: requestedId }, options) => {
      paymentReads++
      assert.equal(requestedId, paymentId)
      assert.equal(options.maxRetries, 0)
      return paymentResponse
    },
    create: async () => {
      paymentCreates++
      throw new Error("PAYMENT_CREATION_FORBIDDEN")
    }
  }
}

const Order = {
  findById: requestedId => {
    assert.equal(requestedId, id)
    return {
      lean: async () => ({
        _id: id,
        squareEnvironment: "production",
        status: "payment_required",
        paymentStatus: "unpaid"
      })
    }
  },
  updateOne: async () => {
    writes++
    throw new Error("UNEXPECTED_WRITE")
  }
}

const PaymentOperation = {
  findOne: filters => {
    assert.equal(filters.orderId, id)
    assert.equal(filters.environment, "production")
    return {
      lean: async () => ({
        orderId: id,
        environment: "production",
        squareOrderId
      })
    }
  }
}

try {
  process.env.NODE_ENV = "test"
  process.env.SQUARE_PRODUCTION_LOCATION_ID = locationId

  const boundary =
    createV3ProductionResolvedEvidenceBoundaryIsolated({
      testClient: client
    })

  const request = {
    orderId: id,
    connection: {
      startSession: async () => {
        transactionStarts++
        throw new Error("TRANSACTION_NOT_AUTHORIZED")
      }
    },
    Order,
    Reservation: {},
    PaymentOperation,

    // These fields must never control Square retrieval.
    squareOrderId: "attacker-order",
    paymentId: "attacker-payment",
    expectedLocationId: "attacker-location",
    lookupSquareEvidence: async () => {
      attackerCalls++
      throw new Error("ATTACKER_LOOKUP_USED")
    },
    verifiedBinding: {
      bindingVerified: true,
      databaseWriteAuthorized: true
    }
  }

  // The reader succeeds, but incomplete synthetic business
  // evidence must be rejected by the existing verifier.
  await assert.rejects(
    boundary.record(request),
    /V3 production webhook payment binding rejected\./
  )

  assert.equal(orderReads, 1)
  assert.equal(paymentReads, 1)
  assert.equal(attackerCalls, 0)
  assert.equal(transactionStarts, 0)
  assert.equal(writes, 0)
  assert.equal(paymentCreates, 0)

  console.log("PASS: Stored order ID drives Square retrieval")
  console.log("PASS: Square order determines payment ID")
  console.log("PASS: Request overrides are ignored")
  console.log("PASS: Incomplete evidence cannot start a transaction")

  orderResponse = {
    order: {
      id: squareOrderId,
      locationId,
      tenders: []
    }
  }

  await assert.rejects(
    boundary.record(request),
    /SQUARE_PAYMENT_ID_UNRESOLVED/
  )

  assert.equal(paymentReads, 1)

  console.log("PASS: Missing tender payment ID fails closed")

  orderResponse = {
    order: {
      id: squareOrderId,
      locationId,
      tenders: [
        { paymentId },
        { paymentId: "second-payment" }
      ]
    }
  }

  await assert.rejects(
    boundary.record(request),
    /SQUARE_PAYMENT_ID_UNRESOLVED/
  )

  console.log("PASS: Multiple tenders fail closed")

  orderResponse = {
    order: {
      id: squareOrderId,
      locationId,
      tenders: [{ paymentId }]
    }
  }

  paymentResponse = {
    payment: {
      id: paymentId,
      orderId: "wrong-order",
      locationId,
      status: "COMPLETED"
    }
  }

  await assert.rejects(
    boundary.record(request),
    /SQUARE_PAYMENT_IDENTITY_MISMATCH/
  )

  console.log("PASS: Wrong payment association fails closed")

  assert.equal(attackerCalls, 0)
  assert.equal(transactionStarts, 0)
  assert.equal(writes, 0)
  assert.equal(paymentCreates, 0)

  console.log("PASS: Rejection paths create no payments or writes")

  process.env.NODE_ENV = "production"

  assert.throws(
    () => createV3ProductionResolvedEvidenceBoundaryIsolated({
      testClient: client
    }),
    /ISOLATED_TEST_ONLY/
  )

  await assert.rejects(
    boundary.record(request),
    /ISOLATED_TEST_ONLY/
  )

  console.log("PASS: Production recording remains blocked")

  console.log("")
  console.log("STEP 95 RESOLVED EVIDENCE INTEGRATION: PASSED")
  console.log("SQUARE: MOCKED")
  console.log("DATABASE: MOCKED")
  console.log("NO LIVE SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")
  console.log("NO PRODUCTION WRITES")
} finally {
  if (previousMode === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = previousMode
  }

  if (previousLocation === undefined) {
    delete process.env.SQUARE_PRODUCTION_LOCATION_ID
  } else {
    process.env.SQUARE_PRODUCTION_LOCATION_ID =
      previousLocation
  }
}
