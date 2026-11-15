import {
  createV3ServerOwnedLocalEvidenceReaders
} from "./createV3ServerOwnedLocalEvidenceReaders.js";

import {
  createV3ServerBoundFirstPaymentReview
} from "./createV3ServerBoundFirstPaymentReview.js";

const SQUARE_UNBOUND =
  "V3_SQUARE_SOURCE_PROVENANCE_NOT_CONNECTED";

const unresolved = (orderId, source) => Object.freeze({
  orderId,
  environment: "sandbox",
  source,
  complete: false,
  reason: SQUARE_UNBOUND,
  provenanceVerified: false,
  trustedForReconciliation: false,
  authoritativeAbsenceEstablished: false,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false,
  safeForAuthorization: false
});

/**
 * Explicitly unresolved Square evidence.
 *
 * These readers never contact Square and never
 * report historical absence or authorization.
 */
export function createV3UnresolvedSquareEvidenceReaders() {
  return Object.freeze({
    async readPaymentLinks({ orderId } = {}) {
      return unresolved(orderId, "paymentLinks");
    },

    async readSquareOrders({ orderId } = {}) {
      return unresolved(orderId, "squareOrders");
    },

    async readSquarePayments({ orderId } = {}) {
      return unresolved(orderId, "squarePayments");
    }
  });
}

/**
 * Server-owned local readers plus unresolved Square evidence.
 *
 * This accepts no request configuration or reader callbacks.
 * It exposes only a read-only diagnostic review method.
 *
 * It cannot grant payment authorization or history clearance.
 */
export async function createV3ServerOwnedFiveSourceDiagnosticReview() {
  const localReaders =
    await createV3ServerOwnedLocalEvidenceReaders();

  const squareReaders =
    createV3UnresolvedSquareEvidenceReaders();

  const service =
    createV3ServerBoundFirstPaymentReview({
      ...localReaders,
      ...squareReaders
    });

  return Object.freeze({
    reviewWithDiagnostics(orderId) {
      return service.reviewWithDiagnostics(orderId);
    }
  });
}
