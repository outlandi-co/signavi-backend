import {
  collectV3FirstPaymentEvidenceReadOnly
} from "./collectV3FirstPaymentEvidenceReadOnly.js";

import {
  adaptV3FirstPaymentReaderEvidence
} from "./adaptV3FirstPaymentReaderEvidence.js";

/**
 * Review-only coordinator.
 *
 * Executes the existing supplied server-side readers,
 * captures their actual responses, and applies the strict
 * adapter after the collector checks source identity.
 *
 * No Square authorization, SDK construction or DB writes.
 * Caller-provided functions are not proof of provenance.
 */

const blocked = (reason) => Object.freeze({
  assessed: false,
  readyForAuthorizationReview: false,
  reason,
  source: null,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const readers = [
  ["readKnownHistory", "knownHistory"],
  ["readPaymentLinks", "paymentLinks"],
  ["readSquareOrders", "squareOrders"],
  ["readSquarePayments", "squarePayments"],
  ["readOwnership", "ownership"]
];

export async function collectV3FirstPaymentStrictReview(
  input = {}
) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input)
  ) {
    return blocked("TRUSTED_READER_INPUT_INVALID");
  }

  const captured = Object.create(null);
  const wrapped = { ...input };

  for (const [readerName, evidenceName] of readers) {
    const original = input[readerName];

    if (typeof original !== "function") {
      return blocked("TRUSTED_READER_MISSING");
    }

    wrapped[readerName] = async (...args) => {
      const evidence = await original(...args);
      captured[evidenceName] = evidence;
      return evidence;
    };
  }

  let collectorResult;

  try {
    collectorResult =
      await collectV3FirstPaymentEvidenceReadOnly(wrapped);
  } catch {
    return blocked("EVIDENCE_COLLECTION_FAILED");
  }

  if (
    !collectorResult ||
    collectorResult.readyForAuthorizationReview !== true ||
    collectorResult.squareRequestAuthorized !== false ||
    collectorResult.initializationAuthorized !== false ||
    collectorResult.retryAuthorized !== false
  ) {
    return blocked(
      collectorResult?.reason ??
      "COLLECTOR_REVIEW_NOT_VERIFIED"
    );
  }

  const strictResult =
    adaptV3FirstPaymentReaderEvidence(captured);

  if (
    strictResult.readyForAuthorizationReview !== true ||
    strictResult.squareRequestAuthorized !== false ||
    strictResult.initializationAuthorized !== false ||
    strictResult.retryAuthorized !== false ||
    strictResult.authoritativeNoPriorActivity !== false
  ) {
    return blocked(
      strictResult.reason ?? "STRICT_REVIEW_NOT_VERIFIED"
    );
  }

  return Object.freeze({
    assessed: true,
    readyForAuthorizationReview: true,
    reason: "STRICT_EVIDENCE_CANDIDATE_REQUIRES_TRUSTED_REVIEW",
    source: null,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}
