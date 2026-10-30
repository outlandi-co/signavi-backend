const result = (reason, source = null) => Object.freeze({
  cleared: false,
  readyForTrustedInitialization: false,
  squareRequestAuthorized: false,
  retryAuthorized: false,
  httpStatus: 423,
  reason,
  source
})

/**
 * Conservative assessment of known payment evidence.
 *
 * This function is NOT an external-history verifier,
 * a Square lookup, or permission to initiate payment.
 *
 * Input must come from trusted server-side readers.
 * No caller-supplied "clear" flag is accepted.
 */
export function assessV3ExternalReconciliation({
  orderId,
  knownHistory,
  squareEvidence
} = {}) {
  if (
    typeof orderId !== "string" ||
    !/^[0-9a-f]{24}$/.test(orderId)
  ) {
    return result("INVALID_ORDER_ID")
  }

  if (
    !knownHistory ||
    knownHistory.knownRecordsClear !== true
  ) {
    return result(
      "KNOWN_PAYMENT_HISTORY_NOT_CLEARED",
      knownHistory?.source ?? null
    )
  }

  if (
    squareEvidence?.conflicting === true ||
    squareEvidence?.identityMismatch === true
  ) {
    return result("SQUARE_EVIDENCE_CONFLICT", "Square")
  }

  if (
    squareEvidence?.existingPayment === true ||
    squareEvidence?.existingLink === true
  ) {
    return result(
      "EXISTING_SQUARE_ACTIVITY_REQUIRES_RECONCILIATION",
      "Square"
    )
  }

  // An empty result, successful single lookup, or
  // browser-provided clearance cannot prove complete
  // absence of historical Square activity.
  return result(
    "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED",
    "Square"
  )
}