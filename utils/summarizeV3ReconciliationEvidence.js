const reasons = new Set([
  "MATCHING_SQUARE_PAYMENT_FOUND",
  "SEARCH_COMPLETED_WITHOUT_CLEARANCE",
  "REPEATED_SQUARE_CURSOR",
  "SQUARE_LIST_FAILED",
  "SQUARE_PAGE_LIMIT_REACHED",
  "INVALID_SQUARE_PAGE",
  "INVALID_PAYMENT_RECORD",
  "INVALID_SEARCH_WINDOW",
  "INVALID_TRUSTED_SEARCH_INPUT"
])

const classifications = Object.freeze({
  MATCHING_SQUARE_PAYMENT_FOUND: "existing_payment",
  SEARCH_COMPLETED_WITHOUT_CLEARANCE: "history_not_verified",
  REPEATED_SQUARE_CURSOR: "pagination_uncertain",
  SQUARE_LIST_FAILED: "external_lookup_failed",
  SQUARE_PAGE_LIMIT_REACHED: "pagination_incomplete",
  INVALID_SQUARE_PAGE: "invalid_external_data",
  INVALID_PAYMENT_RECORD: "invalid_external_data",
  INVALID_SEARCH_WINDOW: "invalid_search_scope",
  INVALID_TRUSTED_SEARCH_INPUT: "invalid_search_scope"
})

/**
 * Diagnostic reporting only.
 *
 * Does not verify Square history, change reservations,
 * authorize payment creation, or permit retries.
 *
 * Never pass browser-supplied evidence to this component.
 */
export function summarizeV3ReconciliationEvidence({
  inspectorEvidence,
  reconciliationOutcome
} = {}) {
  const sourceReason =
    typeof inspectorEvidence?.reason === "string" &&
    reasons.has(inspectorEvidence.reason)
      ? inspectorEvidence.reason
      : "UNVERIFIED_EXTERNAL_EVIDENCE"

  const category =
    classifications[sourceReason] || "unknown_evidence"

  const nonnegativeCount = value =>
    Number.isSafeInteger(value) && value >= 0
      ? value
      : null

  return Object.freeze({
    status: "reconciliation_required",
    httpStatus: 423,
    source: "Square",
    sourceReason,
    category,
    reconciliationReason:
      typeof reconciliationOutcome?.reason === "string" &&
      reconciliationOutcome.reason ===
        "EXISTING_SQUARE_ACTIVITY_REQUIRES_RECONCILIATION"
        ? reconciliationOutcome.reason
        : "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED",
    pagesScanned: nonnegativeCount(
      inspectorEvidence?.pagesScanned
    ),
    paymentsScanned: nonnegativeCount(
      inspectorEvidence?.paymentsScanned
    ),
    existingPayment:
      inspectorEvidence?.existingPayment === true,
    historyListingCompleted:
      inspectorEvidence?.historyListingCompleted === true,
    verified: false,
    noPriorPaymentActivity: false,
    cleared: false,
    readyForTrustedInitialization: false,
    squareRequestAuthorized: false,
    retryAuthorized: false,
    paymentCreated: false
  })
}