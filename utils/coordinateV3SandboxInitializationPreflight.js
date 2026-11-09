import {
  verifyV3SandboxInitializationEvidence
} from "./verifyV3SandboxInitializationEvidence.js";

import {
  buildV3SandboxInitializationDocuments
} from "./buildV3SandboxInitializationDocuments.js";

const blocked = reason => Object.freeze({
  ready: false,
  reason,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Compare independently verified evidence with prepared documents.
 *
 * This is only a read-only candidate assessment. A true result
 * is never permission to initialize records or call Square.
 */
export function assessV3VerifiedInitializationCandidate({
  evidence,
  candidate
} = {}) {
  if (
    evidence?.verified !== true ||
    evidence.initializationAuthorized !== false ||
    evidence.squareRequestAuthorized !== false ||
    evidence.retryAuthorized !== false
  ) {
    return blocked("VERIFIED_EVIDENCE_REQUIRED");
  }

  if (
    candidate?.eligible !== true ||
    candidate.initializationAuthorized !== false ||
    candidate.squareRequestAuthorized !== false ||
    candidate.retryAuthorized !== false
  ) {
    return blocked("PREPARED_DOCUMENTS_REQUIRED");
  }

  if (
    !/^[0-9a-f]{24}$/.test(String(evidence.orderId || "")) ||
    evidence.orderId !== candidate.orderId ||
    !Number.isSafeInteger(evidence.amountCents) ||
    evidence.amountCents <= 0 ||
    evidence.amountCents !== candidate.amountCents ||
    typeof evidence.checkoutReferenceId !== "string" ||
    !evidence.checkoutReferenceId.trim() ||
    evidence.checkoutReferenceId !== candidate.checkoutReferenceId
  ) {
    return blocked("INITIALIZATION_IDENTITY_OR_AMOUNT_MISMATCH");
  }

  return Object.freeze({
    ready: true,
    reason: "INITIALIZATION_CANDIDATE_VERIFIED_ONLY",
    orderId: evidence.orderId,
    amountCents: evidence.amountCents,
    checkoutReferenceId: evidence.checkoutReferenceId,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}

/**
 * Server-side read-only initialization preflight.
 *
 * No writes, no Square requests, no lock changes.
 * Do not expose this as a payment authorization endpoint.
 */
export async function coordinateV3SandboxInitializationPreflight(
  input = {}
) {
  let evidence;

  try {
    evidence = await verifyV3SandboxInitializationEvidence(input);
  } catch {
    return blocked("INITIALIZATION_EVIDENCE_UNCERTAIN");
  }

  if (evidence?.verified !== true) {
    return blocked(
      evidence?.reason || "INITIALIZATION_EVIDENCE_NOT_VERIFIED"
    );
  }

  let candidate;

  try {
    candidate = buildV3SandboxInitializationDocuments({
      storefrontOrder: input.storefrontOrder,
      storefrontOperation: input.storefrontOperation,
      sandboxOrder: input.sandboxOrder ?? null,
      sandboxOperation: input.sandboxOperation ?? null
    });
  } catch {
    return blocked("INITIALIZATION_DOCUMENT_PREPARATION_FAILED");
  }

  return assessV3VerifiedInitializationCandidate({
    evidence,
    candidate
  });
}