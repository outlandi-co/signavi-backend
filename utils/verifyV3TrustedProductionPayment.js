import {
  verifyV3ProductionWebhookPaymentBinding
} from "./smartShippingV3ProductionWebhookPaymentBinding.js"

/**
 * Trusted payment verification stage.
 *
 * The Square evidence reader must be constructed by
 * trusted server-side wiring, never from browser input.
 *
 * This module does not update MongoDB or authorize
 * additional Square payment creation.
 */
export async function verifyV3TrustedProductionPayment({
  order,
  operation,
  paymentId,
  evidenceReader,
  expectedLocationId
} = {}) {
  if (
    !order?._id ||
    !operation ||
    typeof paymentId !== "string" ||
    !paymentId.trim() ||
    typeof evidenceReader?.readEvidence !== "function" ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim() ||
    !operation.squareOrderId
  ) {
    throw new Error("TRUSTED_PAYMENT_VERIFICATION_INPUT_INVALID")
  }

  const evidence = await evidenceReader.readEvidence({
    paymentId,
    squareOrderId: operation.squareOrderId
  })

  if (!evidence?.payment || !evidence?.squareOrder) {
    throw new Error("AUTHENTICATED_SQUARE_EVIDENCE_REQUIRED")
  }

  const binding = verifyV3ProductionWebhookPaymentBinding({
    order,
    operation,
    payment: evidence.payment,
    squareOrder: evidence.squareOrder,
    expectedLocationId
  })

  if (binding.bindingVerified !== true) {
    throw new Error("PRODUCTION_PAYMENT_BINDING_REJECTED")
  }

  return Object.freeze({
    verified: true,
    exactPaidReplay: binding.exactPaidReplay === true,
    orderId: String(order._id),
    squareOrderId: binding.squareOrderId,
    squarePaymentId: binding.squarePaymentId,
    amountCents: binding.amountCents,
    databaseWriteAuthorized: false,
    paymentCreationAuthorized: false,
    retryAuthorized: false
  })
}