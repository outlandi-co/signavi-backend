const SOURCE_NAMES = Object.freeze([
  "knownHistory",
  "ownership",
  "paymentLinks",
  "squareOrders",
  "squarePayments"
]);

const SQUARE_NAMES = Object.freeze([
  "paymentLinks",
  "squareOrders",
  "squarePayments"
]);

const isRecord = value =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

/**
 * Diagnostic comparison only.
 *
 * Inputs may contain unauthenticated reader claims.
 * An absence of discrepancies is NOT clearance.
 */
export function assessV3FiveSourceConsistency(
  fiveSourceDiagnostics
) {
  const sources = isRecord(fiveSourceDiagnostics)
    ? fiveSourceDiagnostics
    : {};

  const issues = [];
  const missingOrUnverified = [];
  const incompleteSources = [];
  const contradictorySources = [];
  const squareActivitySources = [];

  for (const name of SOURCE_NAMES) {
    const source = sources[name];

    if (
      !isRecord(source) ||
      source.present !== true ||
      source.identityMatched !== true
    ) {
      missingOrUnverified.push(name);
      continue;
    }

    // These are reported status fields, not trusted proofs.
    if (
      source.reportedComplete !== true ||
      source.observation === "REPORTED_INCOMPLETE"
    ) {
      incompleteSources.push(name);
    }

    // A present, identity-matched report may still be
    // internally unverified or contradictory.
    if (
      source.observation === "UNVERIFIED" ||
      source.contradictory === true
    ) {
      contradictorySources.push(name);
    }
  }

  for (const name of SQUARE_NAMES) {
    const source = sources[name];

    if (source?.positiveObserved === true) {
      squareActivitySources.push(name);
    }

    if (source?.contradictory === true) {
      issues.push("CONTRADICTORY_SQUARE_SOURCE_REPORT");
    }
  }

  if (missingOrUnverified.length > 0) {
    issues.push("MISSING_OR_IDENTITY_UNVERIFIED_SOURCE");
  }

  if (incompleteSources.length > 0) {
    issues.push("INCOMPLETE_SOURCE_REPORT");
  }

  if (contradictorySources.length > 0) {
    issues.push("CONTRADICTORY_OR_UNVERIFIED_SOURCE_REPORT");
  }

  if (squareActivitySources.length > 0) {
    issues.push("REPORTED_SQUARE_PRIOR_ACTIVITY");
  }

  const localHistory = sources.knownHistory;
  const ownership = sources.ownership;

  // This is a reported disagreement, not proof that
  // either the local or Square reader is authoritative.
  const localClearSquareActivityDisagreement =
    localHistory?.identityMatched === true &&
    localHistory.reportedKnownRecordsClear === true &&
    squareActivitySources.length > 0;

  if (localClearSquareActivityDisagreement) {
    issues.push("LOCAL_CLEAR_VS_SQUARE_ACTIVITY_REPORTED");
  }

  if (
    ownership?.identityMatched === true &&
    (
      ownership.reportedExclusive !== true ||
      ownership.reportedDurable !== true
    )
  ) {
    issues.push("OWNERSHIP_ASSURANCES_NOT_REPORTED");
  }

  if (
    localHistory?.identityMatched === true &&
    localHistory.reportedKnownRecordsClear !== true
  ) {
    issues.push("LOCAL_HISTORY_CLEARANCE_NOT_REPORTED");
  }

  // The five-source handoff explicitly does not
  // establish source provenance or authoritative absence.
  issues.push("TRUSTED_RECONCILIATION_NOT_ESTABLISHED");

  return Object.freeze({
    assessed: true,
    ready: false,
    reason: "FIVE_SOURCE_RECONCILIATION_DIAGNOSTIC_ONLY",

    sourceCount: SOURCE_NAMES.length,
    missingOrUnverifiedSources: Object.freeze(
      missingOrUnverified
    ),
    incompleteSources: Object.freeze(incompleteSources),
    contradictorySources: Object.freeze(
      contradictorySources
    ),
    reportedSquareActivitySources: Object.freeze(
      squareActivitySources
    ),
    localClearSquareActivityDisagreement,

    // Unique, deterministic issue codes.
    issues: Object.freeze([...new Set(issues)]),

    provenanceVerified: false,
    authoritativeNoPriorActivity: false,
    readyForAuthorizationReview: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}
