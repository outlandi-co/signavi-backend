import assert from "node:assert/strict"

import {
  createV3ProductionOrderEvidenceReader
} from "../utils/createV3ProductionOrderEvidenceReader.js"

const previousMode = process.env.NODE_ENV
const previousLocation =
  process.env.SQUARE_PRODUCTION_LOCATION_ID

const locationId = "isolated-location"
const squareOrderId = "isolated-order"
const paymentId = "isolated-payment"

const baseOrder = {
  id: squareOrderId,
  locationId,
  referenceId: "signavi-v3-test",
  tenders: [{ paymentId }],
  totalMoney: {
    amount: 100n,
    currency: "USD"
  }
}

const basePayment = {
  id: paymentId,
  orderId: squareOrderId,
  locationId,
  status: "COMPLETED",
  amountMoney: {
    amount: 100n,
    currency: "USD"
  }
}

let order = baseOrder
let payment = basePayment
let reads = 0
let creations = 0

try {
  process.env.NODE_ENV = "test"
  process.env.SQUARE_PRODUCTION_LOCATION_ID =
    locationId

  const reader = createV3ProductionOrderEvidenceReader({
    testClient: {
      orders: {
        get: async () => {
          reads++
          return { order }
        }
      },
      payments: {
        get: async () => {
          reads++
          return { payment }
        },

        create: async () => {
          creations++
          throw new Error("PAYMENT_CREATION_FORBIDDEN")
        }
      }
    }
  })

  const run = () =>
    reader.readEvidence({ squareOrderId })

  let result = await run()

  assert.equal(result.payment.amount_money.amount, 100)
  assert.equal(result.squareOrder.total_money.amount, 100)

  console.log("PASS: Valid SDK BigInt amounts normalize")

  async function rejectPayment(changes, code) {
    order = baseOrder
    payment = { ...basePayment, ...changes }

    await assert.rejects(run(), new RegExp(code))

    assert.equal(creations, 0)
    payment = basePayment
  }

  async function rejectOrder(changes, code) {
    payment = basePayment
    order = { ...baseOrder, ...changes }

    await assert.rejects(run(), new RegExp(code))

    assert.equal(creations, 0)
    order = baseOrder
  }

  await rejectPayment({
    order_id: "different-order"
  }, "SQUARE_EVIDENCE_ALIAS_CONFLICT")

  console.log("PASS: Conflicting payment order IDs rejected")

  await rejectPayment({
    location_id: "different-location"
  }, "SQUARE_EVIDENCE_ALIAS_CONFLICT")

  console.log("PASS: Conflicting payment locations rejected")

  await rejectOrder({
    reference_id: "different-reference"
  }, "SQUARE_EVIDENCE_ALIAS_CONFLICT")

  console.log("PASS: Conflicting order references rejected")

  await rejectOrder({
    location_id: "different-location"
  }, "SQUARE_EVIDENCE_ALIAS_CONFLICT")

  console.log("PASS: Conflicting order locations rejected")

  await rejectPayment({
    amount_money: {
      amount: 999,
      currency: "USD"
    }
  }, "SQUARE_MONEY_ALIAS_CONFLICT")

  console.log("PASS: Conflicting payment money aliases rejected")

  await rejectOrder({
    total_money: {
      amount: 999,
      currency: "USD"
    }
  }, "SQUARE_MONEY_ALIAS_CONFLICT")

  console.log("PASS: Conflicting order money aliases rejected")

  await rejectPayment({
    amountMoney: {
      amount: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
      currency: "USD"
    }
  }, "SQUARE_MONEY_AMOUNT_INVALID")

  console.log("PASS: Unsafe BigInt rejected")

  await rejectPayment({
    amountMoney: {
      amount: -1n,
      currency: "USD"
    }
  }, "SQUARE_MONEY_AMOUNT_INVALID")

  console.log("PASS: Negative monetary amount rejected")

  // The reader can return incomplete evidence, but it must
  // never invent missing money values. The downstream verifier
  // remains responsible for rejecting incomplete payment data.
  payment = { ...basePayment }
  delete payment.amountMoney

  result = await run()

  assert.equal(result.payment.amount_money, undefined)

  console.log("PASS: Missing money is not fabricated")

  assert.equal(creations, 0)
  assert.ok(reads > 0)

  console.log("PASS: No payment creation")
  console.log("")
  console.log("STEP 99 ALIAS SECURITY TESTS: PASSED")
  console.log("SQUARE: MOCKED")
  console.log("DATABASE: NOT ACCESSED")
  console.log("NO LIVE API REQUESTS")
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
