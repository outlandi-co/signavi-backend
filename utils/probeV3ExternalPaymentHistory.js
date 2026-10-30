const validId = /^[0-9a-f]{24}$/

const blocked = (reason, source = "Square") =>
  Object.freeze({
    verified: false,
    noPriorPaymentActivity: false,
    readyForTrustedInitialization: false,
    squareRequestAuthorized: false,
    retryAuthorized: false,
    httpStatus: 423,
    reason,
    source
  })

/**
 * Read-only external-history probe.
 *
 * The lookup function must be bound by trusted server code.
 * This function NEVER establishes complete negative history
 * or grants permission to create a Square payment.
 *
 * Do not connect it directly to payment execution.
 */
export async function probeV3ExternalPaymentHistory({
  orderId,
  lookup
} = {}) {
  if (
    typeof orderId !== "string" ||
    !validId.test(orderId)
  ) {
    return blocked("INVALID_ORDER_ID", null)
  }

  if (typeof lookup !== "function") {
    return blocked("TRUSTED_LOOKUP_MISSING")
  }

  let evidence

  try {
    evidence = await lookup(
      Object.freeze({ orderId })
    )
  } catch {
    return blocked("EXTERNAL_HISTORY_LOOKUP_FAILED")
  }

  if (
    !evidence ||
    typeof evidence !== "object" ||
    Array.isArray(evidence)
  ) {
    return blocked("EXTERNAL_HISTORY_RESPONSE_INVALID")
  }

  if (
    evidence.conflicting === true ||
    evidence.identityMismatch === true
  ) {
    return blocked("EXTERNAL_HISTORY_CONFLICT")
  }

  if (
    evidence.existingPayment === true ||
    evidence.existingLink === true
  ) {
    return blocked("EXISTING_SQUARE_ACTIVITY")
  }

  if (
    evidence.complete === false ||
    evidence.hasMore === true ||
    evidence.timedOut === true
  ) {
    return blocked("EXTERNAL_HISTORY_INCOMPLETE")
  }

  // Neither an empty result nor a positive "verified"
  // flag proves exhaustive Square history clearance.
  return blocked("EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED")
}