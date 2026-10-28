import {
  reconcileV3ProductionPaymentOutcomeIsolated
} from "./reconcileV3ProductionPaymentOutcomeIsolated.js"

/**
 * TEST ONLY: single-attempt payment-recording recovery.
 *
 * No Square calls, automatic recording retries, or database writes.
 * attemptRecording and Order are injected for isolated testing only.
 */
export async function recoverV3ProductionUncertainRecordingIsolated({
  orderId,
  Order,
  squarePaymentId,
  squareOrderId,
  amountCents,
  attemptRecording
} = {}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  if (typeof attemptRecording !== "function") {
    throw new Error("RECORDING_ATTEMPT_REQUIRED")
  }

  const result = (outcome, reason) => Object.freeze({
    outcome,
    reason,
    paymentCreationAuthorized: false,
    retryAuthorized: false,
    databaseWriteAuthorized: false
  })

  // Validate inputs before even attempting a recording.
  // The same validation is used by the read-only reconciler.
  const id = String(orderId ?? "").toLowerCase()

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    typeof Order?.findById !== "function" ||
    typeof squarePaymentId !== "string" ||
    !squarePaymentId.trim() ||
    typeof squareOrderId !== "string" ||
    !squareOrderId.trim() ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    throw new Error("RECOVERY_INPUT_INVALID")
  }

  try {
    const recorded = await attemptRecording()

    if (recorded?.recorded === true) {
      return result("recorded", "RECORDING_ACKNOWLEDGED")
    }

    // Do not interpret a negative or unexpected return value
    // as proof that no payment was recorded.
    return result("unknown", "RECORDING_RESULT_UNCONFIRMED")
  } catch {
    // No second recording attempt.
    // Read durable state once and always fail closed.
    const reconciliation =
      await reconcileV3ProductionPaymentOutcomeIsolated({
        orderId: id,
        Order,
        squarePaymentId,
        squareOrderId,
        amountCents
      })

    return result(
      reconciliation.outcome,
      reconciliation.reason
    )
  }
}
