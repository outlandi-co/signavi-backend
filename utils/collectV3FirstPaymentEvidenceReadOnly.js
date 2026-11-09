import {
  assessV3FirstPaymentEvidence
} from "./assessV3FirstPaymentEvidence.js";

const blocked = reason => Object.freeze({
  assessed: false,
  reason,
  readyForAuthorizationReview: false,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Internal read-only coordination boundary.
 *
 * Readers must be bound to trusted, server-owned sources.
 * Never expose injected readers through public HTTP input.
 * This function cannot authorize payment creation.
 */
export async function collectV3FirstPaymentEvidenceReadOnly({
  orderId,
  readKnownHistory,
  readPaymentLinks,
  readSquareOrders,
  readSquarePayments,
  readOwnership
} = {}) {
  const id = String(orderId || "").toLowerCase();

  if (!/^[a-f0-9]{24}$/.test(id)) {
    return blocked("INVALID_ORDER_ID");
  }

  const readers = [
    ["knownHistory", readKnownHistory],
    ["paymentLinks", readPaymentLinks],
    ["squareOrders", readSquareOrders],
    ["squarePayments", readSquarePayments],
    ["ownership", readOwnership]
  ];

  if (readers.some(([, reader]) =>
    typeof reader !== "function"
  )) {
    return blocked("TRUSTED_READER_MISSING");
  }

  const evidence = {};

  try {
    for (const [name, reader] of readers) {
      const value = await reader(
        Object.freeze({ orderId: id })
      );

      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        return blocked("EVIDENCE_RESPONSE_INVALID");
      }

      if (
        value.orderId !== id ||
        value.environment !== "sandbox"
      ) {
        return blocked("EVIDENCE_IDENTITY_MISMATCH");
      }

      evidence[name] = value;
    }
  } catch {
    return blocked("EVIDENCE_READER_FAILED");
  }

  const assessment = assessV3FirstPaymentEvidence(
    evidence
  );

  return Object.freeze({
    ...assessment,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}