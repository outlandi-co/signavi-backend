import test from "node:test"
import assert from "node:assert/strict"

import {
  verifyV3TrustedProductionPayment
} from "../utils/verifyV3TrustedProductionPayment.js"

const orderId = "507f1f77bcf86cd799439011"

const order = {
  _id: orderId,
  status: "payment_required",
  paymentStatus: "unpaid"
}

const operation = {
  orderId,
  environment: "production",
  squareOrderId: "square-test-order"
}

test("forwards both stored Square identity fields", async () => {
  const calls = []

  await assert.rejects(
    verifyV3TrustedProductionPayment({
      order,
      operation,
      paymentId: "payment-test",
      expectedLocationId: "location-test",
      evidenceReader: {
        readEvidence: async args => {
          calls.push(args)

          return {
            payment: {
              id: "incorrect-payment",
              status: "FAILED"
            },
            squareOrder: {
              id: "square-test-order"
            }
          }
        }
      }
    }),
    /V3 production webhook payment binding rejected\./
  )

  assert.deepEqual(calls, [{
    paymentId: "payment-test",
    squareOrderId: "square-test-order"
  }])
})
test("rejects missing trusted evidence reader", async () => {
  await assert.rejects(
    verifyV3TrustedProductionPayment({
      order,
      operation,
      paymentId: "payment-test",
      expectedLocationId: "location-test"
    }),
    /TRUSTED_PAYMENT_VERIFICATION_INPUT_INVALID/
  )
})

test("rejects missing Square evidence", async () => {
  await assert.rejects(
    verifyV3TrustedProductionPayment({
      order,
      operation,
      paymentId: "payment-test",
      expectedLocationId: "location-test",
      evidenceReader: {
        readEvidence: async () => ({
          payment: null,
          squareOrder: null
        })
      }
    }),
    /AUTHENTICATED_SQUARE_EVIDENCE_REQUIRED/
  )
})

test("rejects inconsistent Square payment binding", async () => {
  await assert.rejects(
    verifyV3TrustedProductionPayment({
      order,
      operation,
      paymentId: "payment-test",
      expectedLocationId: "location-test",
      evidenceReader: {
        readEvidence: async () => ({
          payment: {
            id: "incorrect-payment",
            status: "FAILED"
          },
          squareOrder: {
            id: "square-test-order"
          }
        })
      }
    }),
    /V3 production webhook payment binding rejected\./
  )
})

test("accepts completed Square payment with recorded link", async () => {
  const { createV3SquareSafeCheckoutReference } =
    await import("../utils/smartShippingV3CheckoutReference.js")

  const reference = createV3SquareSafeCheckoutReference({
    orderId
  })

  const completeOrder = {
    ...order,
    currency: "USD",
    squareEnvironment: "production",
    squareExpectedAmountCents: 100
  }

  const completeOperation = {
    ...operation,
    status: "reconciliation_required",
    requestOwner: "trusted-owner-123",
    idempotencyKey: `signavi-v3-production-purchase-${orderId}`,
    squarePaymentLinkId: "link-test",
    paymentUrl: "https://square.link/u/test123",
    checkoutReferenceId: reference,
    amountCents: 100
  }

  const result = await verifyV3TrustedProductionPayment({
    order: completeOrder,
    operation: completeOperation,
    paymentId: "payment-test",
    expectedLocationId: "location-test",
    evidenceReader: {
      readEvidence: async () => ({
        payment: {
          id: "payment-test",
          status: "COMPLETED",
          order_id: "square-test-order",
          location_id: "location-test",
          amount_money: {
            amount: 100,
            currency: "USD"
          }
        },
        squareOrder: {
          id: "square-test-order",
          location_id: "location-test",
          reference_id: reference,
          total_money: {
            amount: 100,
            currency: "USD"
          }
        }
      })
    }
  })

  assert.equal(result.verified, true)
  assert.equal(result.exactPaidReplay, false)
  assert.equal(result.squarePaymentId, "payment-test")
  assert.equal(result.amountCents, 100)
  assert.equal(result.databaseWriteAuthorized, false)
  assert.equal(result.paymentCreationAuthorized, false)
})
