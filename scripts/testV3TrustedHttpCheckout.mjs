import assert from "node:assert/strict"
import test from "node:test"

import {
  prepareV3TrustedHttpCheckout
} from "../utils/prepareV3TrustedHttpCheckout.js"

const id = "6ae34a462c2d260840ced9bc"
const purchaseKey = `signavi-v3-production-purchase-${id}`

const order = () => ({
  _id: id,
  status: "payment_required",
  paymentStatus: "unpaid",
  finalPrice: 27.50,
  paymentUrl: "",
  squarePaymentId: "",
  squareOrderId: "",
  squarePaymentLinkId: "",
  paymentUrlCreatedAt: null
})

function dependencies(overrides = {}) {
  const calls = {
    auth: 0,
    history: 0,
    initialize: 0
  }

  const options = {
    order: order(),
    authorizeRequest: async () => {
      calls.auth++
      return true
    },
    checkHistoricalPayment: async () => {
      calls.history++
      return {
        verified: true,
        noPriorPaymentActivity: true
      }
    },
    initializeCheckout: async ({ orderId }) => {
      calls.initialize++
      return {
        prepared: true,
        orderId,
        purchaseKey
      }
    },
    ...overrides
  }

  return { options, calls }
}

test("authorized and cleared checkout can initialize", async () => {
  const { options, calls } = dependencies()

  const result = await prepareV3TrustedHttpCheckout(options)

  assert.equal(result.ready, true)
  assert.equal(result.amountCents, 2750)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(calls.auth, 1)
  assert.equal(calls.history, 1)
  assert.equal(calls.initialize, 1)
})

test("unauthorized checkout cannot check history or initialize", async () => {
  const { options, calls } = dependencies({
    authorizeRequest: async () => false
  })

  const result = await prepareV3TrustedHttpCheckout(options)

  assert.equal(result.ready, false)
  assert.equal(result.httpStatus, 403)
  assert.equal(calls.history, 0)
  assert.equal(calls.initialize, 0)
})

test("existing order payment evidence blocks initialization", async () => {
  const existing = order()
  existing.squarePaymentLinkId = "EXISTING_LINK"

  const { options, calls } = dependencies({
    order: existing
  })

  const result = await prepareV3TrustedHttpCheckout(options)

  assert.equal(result.ready, false)
  assert.equal(result.reason, "EXISTING_PAYMENT_EVIDENCE")
  assert.equal(calls.initialize, 0)
})

test("historical activity blocks initialization", async () => {
  const { options, calls } = dependencies({
    checkHistoricalPayment: async () => ({
      verified: true,
      noPriorPaymentActivity: false
    })
  })

  const result = await prepareV3TrustedHttpCheckout(options)

  assert.equal(result.ready, false)
  assert.equal(result.httpStatus, 423)
  assert.equal(calls.initialize, 0)
})

test("uncertain historical checks fail closed", async () => {
  const { options, calls } = dependencies({
    checkHistoricalPayment: async () => {
      throw new Error("SIMULATED_HISTORY_TIMEOUT")
    }
  })

  const result = await prepareV3TrustedHttpCheckout(options)

  assert.equal(result.ready, false)
  assert.equal(result.httpStatus, 423)
  assert.equal(calls.initialize, 0)
})

test("unverified initializer cannot authorize execution", async () => {
  const { options } = dependencies({
    initializeCheckout: async () => ({
      prepared: true,
      orderId: id,
      purchaseKey: "WRONG_KEY"
    })
  })

  const result = await prepareV3TrustedHttpCheckout(options)

  assert.equal(result.ready, false)
  assert.equal(result.squareRequestAuthorized, false)
})

test("missing trusted callbacks fail closed", async () => {
  const result = await prepareV3TrustedHttpCheckout({
    order: order()
  })

  assert.equal(result.ready, false)
  assert.equal(result.httpStatus, 503)
})