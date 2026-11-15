import {
  assessV3FirstPaymentEvidence
} from "./assessV3FirstPaymentEvidence.js";

/**
 * Strict, review-only evidence validation.
 *
 * This module is NOT an execution authorization boundary.
 * It does not collect evidence or prove reader provenance.
 * It must never enable Square payment creation.
 */

const blocked = (reason, source = null) => Object.freeze({
  assessed: false,
  readyForAuthorizationReview: false,
  reason,
  source,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const booleanFields = [
  "complete",
  "hasMore",
  "timedOut",
  "priorActivityFound",
  "existingPayment",
  "existingLink",
  "conflicting",
  "identityMismatch"
];

export function reviewV3FirstPaymentEvidenceStrict(
  evidence = {}
) {
  if (!isRecord(evidence)) {
    return blocked("EVIDENCE_INPUT_INVALID");
  }

  const {
    knownHistory,
    paymentLinks,
    squareOrders,
    squarePayments,
    ownership
  } = evidence;

  if (
    !isRecord(knownHistory) ||
    typeof knownHistory.knownRecordsClear !== "boolean"
  ) {
    return blocked("KNOWN_HISTORY_INVALID", "MongoDB");
  }

  if (
    !isRecord(ownership) ||
    typeof ownership.exclusive !== "boolean" ||
    typeof ownership.durable !== "boolean"
  ) {
    return blocked("OWNERSHIP_INVALID", "MongoDB");
  }

  const sources = [
    ["PaymentLinks", paymentLinks],
    ["SquareOrders", squareOrders],
    ["SquarePayments", squarePayments]
  ];

  for (const [name, source] of sources) {
    if (!isRecord(source)) {
      return blocked("EVIDENCE_SOURCE_MISSING", name);
    }

    for (const field of booleanFields) {
      if (typeof source[field] !== "boolean") {
        return blocked("EVIDENCE_FIELD_INVALID", name);
      }
    }
  }

  const assessment = assessV3FirstPaymentEvidence(evidence);

  // Defense in depth: reject any accidental authorization
  // result from an upstream assessor change.
  if (
    assessment.squareRequestAuthorized !== false ||
    assessment.initializationAuthorized !== false ||
    assessment.retryAuthorized !== false ||
    assessment.authoritativeNoPriorActivity !== false
  ) {
    return blocked("UNEXPECTED_AUTHORIZATION_RESULT");
  }

  return Object.freeze({
    ...assessment,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}
