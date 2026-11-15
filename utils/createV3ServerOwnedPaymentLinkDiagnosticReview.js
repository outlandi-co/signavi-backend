import {
  createV3ServerOwnedLocalEvidenceReaders
} from "./createV3ServerOwnedLocalEvidenceReaders.js";

import {
  createV3ServerOwnedSandboxPaymentLinkEvidenceReader
} from "./createV3ServerOwnedSandboxPaymentLinkEvidenceReader.js";

import {
  createV3UnresolvedSquareEvidenceReaders
} from "./createV3ServerOwnedFiveSourceDiagnosticReview.js";

import {
  createV3ServerBoundFirstPaymentReview
} from "./createV3ServerBoundFirstPaymentReview.js";

/**
 * Server-owned, sandbox-only five-source diagnostics.
 *
 * Local history and ownership use existing MongoDB readers.
 * Payment Links use the existing Square SDK-backed adapter.
 * Square Orders and Payments remain explicitly unresolved.
 *
 * No external reader configuration is accepted.
 * No payment authorization or execution is exposed.
 */
export async function createV3ServerOwnedPaymentLinkDiagnosticReview() {
  const localReaders =
    await createV3ServerOwnedLocalEvidenceReaders();

  const readPaymentLinks =
    createV3ServerOwnedSandboxPaymentLinkEvidenceReader();

  const unresolvedReaders =
    createV3UnresolvedSquareEvidenceReaders();

  const reviewService =
    createV3ServerBoundFirstPaymentReview({
      ...localReaders,
      readPaymentLinks,
      readSquareOrders: unresolvedReaders.readSquareOrders,
      readSquarePayments: unresolvedReaders.readSquarePayments
    });

  return Object.freeze({
    reviewWithDiagnostics(orderId) {
      return reviewService.reviewWithDiagnostics(orderId);
    }
  });
}
