import mongoose from "mongoose"

import {
  verifyV3ProductionWebhookPaymentBinding
} from "./smartShippingV3ProductionWebhookPaymentBinding.js"

import {
  recordV3ProductionPaymentTransactionalIsolated
} from "./recordV3ProductionPaymentTransactionalIsolated.js"

/**
 * ISOLATED TEST ONLY.
 *
 * Caller cannot provide a verifiedBinding object.
 * A real production implementation must own authenticated
 * Square API lookups and must not accept arbitrary lookup
 * implementations from HTTP requests.
 *
 * No Square requests are performed here.
 */
export async function recordV3ProductionVerifiedEntryIsolated({
  orderId,
  connection,
  Order,
  Reservation,
  PaymentOperation,
  lookupSquareEvidence,
  expectedLocationId
} = {}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  const id = String(orderId ?? "").toLowerCase()

  if (
    !mongoose.isObjectIdOrHexString(id) ||
    typeof Order?.findById !== "function" ||
    typeof PaymentOperation?.findOne !== "function" ||
    typeof lookupSquareEvidence !== "function" ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim()
  ) {
    throw new Error("TRUSTED_ENTRY_DEPENDENCIES_REQUIRED")
  }

  const [order, operation] = await Promise.all([
    Order.findById(id).lean(),
    PaymentOperation.findOne({
      orderId: id,
      environment: "production"
    }).lean()
  ])

  if (!order || !operation) {
    throw new Error("PRODUCTION_PURCHASE_RECORD_MISSING")
  }

  // Lookup occurs OUTSIDE the MongoDB transaction.
  const evidence = await lookupSquareEvidence({
    squareOrderId: operation.squareOrderId
  })

  if (!evidence?.payment || !evidence?.squareOrder) {
    throw new Error("TRUSTED_SQUARE_EVIDENCE_MISSING")
  }

  // No caller-supplied verifiedBinding is accepted.
  const binding = verifyV3ProductionWebhookPaymentBinding({
    order,
    operation,
    payment: evidence.payment,
    squareOrder: evidence.squareOrder,
    expectedLocationId
  })

  if (binding.bindingVerified !== true) {
    throw new Error("PRODUCTION_PAYMENT_VERIFICATION_FAILED")
  }

  if (binding.exactPaidReplay) {
    return Object.freeze({
      recorded: false,
      replay: true,
      reason: "EXACT_PAID_REPLAY",
      squareCreationAuthorized: false,
      retryAuthorized: false
    })
  }

  // Database transaction starts only after verification.
  return recordV3ProductionPaymentTransactionalIsolated({
    orderId: id,
    connection,
    Order,
    Reservation,
    PaymentOperation,
    verifiedBinding: binding
  })
}
