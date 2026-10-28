import { SquareClient, SquareEnvironment } from "square"

const validId = value =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 255 &&
  value.trim() === value

/**
 * Standalone read-only V3 production evidence reader.
 *
 * The request accepts ONLY a Square order ID.
 * Payment ID comes from the Square order's tenders.
 *
 * Test client injection is forbidden outside NODE_ENV=test.
 * This module performs no database writes and creates no payments.
 *
 * Not connected to the live production webhook.
 */
export function createV3ProductionOrderEvidenceReader({
  testClient
} = {}) {
  const testMode = process.env.NODE_ENV === "test"

  if (!testMode && testClient !== undefined) {
    throw new Error("SQUARE_TEST_CLIENT_FORBIDDEN")
  }

  const locationId =
    process.env.SQUARE_PRODUCTION_LOCATION_ID

  if (!validId(locationId)) {
    throw new Error("SQUARE_PRODUCTION_LOCATION_REQUIRED")
  }

  let client

  if (testMode && testClient !== undefined) {
    if (
      typeof testClient?.orders?.get !== "function" ||
      typeof testClient?.payments?.get !== "function"
    ) {
      throw new Error("INVALID_TEST_SQUARE_CLIENT")
    }

    client = testClient
  } else {
    const token =
      process.env.SQUARE_PRODUCTION_ACCESS_TOKEN

    if (
      typeof token !== "string" ||
      token.trim().length === 0
    ) {
      throw new Error("SQUARE_PRODUCTION_TOKEN_REQUIRED")
    }

    client = new SquareClient({
      token,
      environment: SquareEnvironment.Production
    })
  }

  return Object.freeze({
    async readEvidence({ squareOrderId } = {}) {
      if (!validId(squareOrderId)) {
        throw new Error("SQUARE_ORDER_ID_REQUIRED")
      }

      let orderResponse

      try {
        orderResponse = await client.orders.get(
          { orderId: squareOrderId },
          { maxRetries: 0 }
        )
      } catch {
        throw new Error("SQUARE_ORDER_RETRIEVAL_FAILED")
      }

      const squareOrder = orderResponse?.order

      if (!squareOrder) {
        throw new Error("SQUARE_ORDER_MISSING")
      }

      if (
        squareOrder.id !== squareOrderId ||
        squareOrder.locationId !== locationId
      ) {
        throw new Error("SQUARE_ORDER_IDENTITY_MISMATCH")
      }

      const tenders = squareOrder.tenders

      if (!Array.isArray(tenders)) {
        throw new Error("SQUARE_PAYMENT_ID_UNRESOLVED")
      }

      const paymentIds = tenders.map(tender =>
        tender?.paymentId
      )

      // Do not guess when the order has no payment ID,
      // an incomplete tender, or multiple tenders.
      if (
        paymentIds.length !== 1 ||
        !validId(paymentIds[0])
      ) {
        throw new Error("SQUARE_PAYMENT_ID_UNRESOLVED")
      }

      const paymentId = paymentIds[0]

      let paymentResponse

      try {
        paymentResponse = await client.payments.get(
          { paymentId },
          { maxRetries: 0 }
        )
      } catch {
        throw new Error("SQUARE_PAYMENT_RETRIEVAL_FAILED")
      }

      const payment = paymentResponse?.payment

      if (!payment) {
        throw new Error("SQUARE_PAYMENT_MISSING")
      }

      if (
        payment.id !== paymentId ||
        payment.orderId !== squareOrderId ||
        payment.locationId !== locationId
      ) {
        throw new Error("SQUARE_PAYMENT_IDENTITY_MISMATCH")
      }

      if (payment.status !== "COMPLETED") {
        throw new Error("SQUARE_PAYMENT_NOT_COMPLETED")
      }

      return Object.freeze({
        payment: Object.freeze({ ...payment }),
        squareOrder: Object.freeze({ ...squareOrder })
      })
    }
  })
}
