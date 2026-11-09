const blocked = (reason, source = null) => Object.freeze({
  assessed: true,
  readyForAuthorizationReview: false,
  reason,
  source,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Classifies evidence supplied by trusted server-side readers.
 *
 * This is NOT an authorization function.
 * No negative search result can authorize first payment creation.
 */
export function assessV3FirstPaymentEvidence({
  knownHistory,
  paymentLinks,
  squareOrders,
  squarePayments,
  ownership
} = {}) {
  if (
    !knownHistory ||
    knownHistory.knownRecordsClear !== true
  ) {
    return blocked("LOCAL_HISTORY_NOT_CLEARED", "MongoDB");
  }

  const sources = [
    ["PaymentLinks", paymentLinks],
    ["SquareOrders", squareOrders],
    ["SquarePayments", squarePayments]
  ];

  for (const [name, evidence] of sources) {
    if (!evidence || typeof evidence !== "object") {
      return blocked("EVIDENCE_SOURCE_MISSING", name);
    }

    if (
      evidence.priorActivityFound === true ||
      evidence.existingPayment === true ||
      evidence.existingLink === true
    ) {
      return blocked("EXISTING_PAYMENT_ACTIVITY", name);
    }

    if (
      evidence.conflicting === true ||
      evidence.identityMismatch === true
    ) {
      return blocked("PAYMENT_IDENTITY_CONFLICT", name);
    }

    if (
      evidence.complete !== true ||
      evidence.hasMore === true ||
      evidence.timedOut === true
    ) {
      return blocked("EVIDENCE_INCOMPLETE", name);
    }
  }

  if (
    !ownership ||
    ownership.exclusive !== true ||
    ownership.durable !== true
  ) {
    return blocked(
      "DURABLE_PURCHASE_OWNERSHIP_NOT_VERIFIED",
      "MongoDB"
    );
  }

  // Even fully supplied evidence is only a candidate for
  // independent authorization review. No payment permission.
  return Object.freeze({
    assessed: true,
    readyForAuthorizationReview: true,
    reason: "EVIDENCE_CANDIDATE_REQUIRES_TRUSTED_REVIEW",
    source: null,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}