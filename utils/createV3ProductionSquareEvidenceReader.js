import { SquareClient, SquareEnvironment } from "square"

const validId = value =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0 &&
  value.length <= 255

/**
 * Standalone, read-only evidence reader.
 *
 * Not connected to production webhook or payment writes.
 * Reads server configuration only at factory initialization.
 * Test client injection is forbidden outside NODE_ENV=test.
 */
export function createV3ProductionSquareEvidenceReader({
  testClient
} = {}) {
  const testMode = process.env.NODE_ENV === "test"

  if (testClient !== undefined && !testMode) {
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
      typeof testClient?.payments?.get !== "function" ||
      typeof testClient?.orders?.get !== "function"
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
    async readEvidence({ paymentId, squareOrderId } = {}) {
      if (!validId(paymentId) || !validId(squareOrderId)) {
        throw new Error("SQUARE_EVIDENCE_IDS_REQUIRED")
      }

      // Request parameters come only from the stored identity.
      // This reader does not accept a token, client, or environment
      // from an individual recording request.
      let paymentResponse
      let orderResponse

      try {
        paymentResponse = await client.payments.get(
          { paymentId },
          { maxRetries: 0 }
        )

        orderResponse = await client.orders.get(
          { orderId: squareOrderId },
          { maxRetries: 0 }
        )
      } catch {
        // Never expose SDK error bodies or credentials.
        throw new Error("SQUARE_EVIDENCE_RETRIEVAL_FAILED")
      }

      const payment = paymentResponse?.payment
      const squareOrder = orderResponse?.order

      if (!payment || !squareOrder) {
        throw new Error("SQUARE_EVIDENCE_MISSING")
      }

      if (
        payment.id !== paymentId ||
        squareOrder.id !== squareOrderId ||
        payment.orderId !== squareOrderId
      ) {
        throw new Error("SQUARE_EVIDENCE_IDENTITY_MISMATCH")
      }

      if (
        payment.locationId !== locationId ||
        squareOrder.locationId !== locationId
      ) {
        throw new Error("SQUARE_EVIDENCE_LOCATION_MISMATCH")
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
