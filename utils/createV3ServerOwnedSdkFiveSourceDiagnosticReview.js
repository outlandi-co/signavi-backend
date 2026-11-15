import {
  createV3ServerOwnedLocalEvidenceReaders
} from "./createV3ServerOwnedLocalEvidenceReaders.js";

import {
  createV3ServerOwnedSandboxPaymentLinkEvidenceReader
} from "./createV3ServerOwnedSandboxPaymentLinkEvidenceReader.js";

import {
  createV3SandboxOrderHistoryReader
} from "./createV3SandboxOrderHistoryReader.js";

import {
  createV3SandboxPaymentEvidenceReader
} from "./createV3SandboxPaymentEvidenceReader.js";

import {
  createV3ServerBoundFirstPaymentReview
} from "./createV3ServerBoundFirstPaymentReview.js";

/**
 * Server-owned five-source sandbox diagnostic composition.
 *
 * No caller-supplied readers or clients.
 * No payment execution methods.
 * No claims of authoritative historical absence.
 */
export async function createV3ServerOwnedSdkFiveSourceDiagnosticReview() {
  if (
    !["test", "development"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    throw new Error("V3_SANDBOX_FIVE_SOURCE_REVIEW_DISABLED");
  }

  const localReaders =
    await createV3ServerOwnedLocalEvidenceReaders();

  const readPaymentLinks =
    createV3ServerOwnedSandboxPaymentLinkEvidenceReader();

  const readSquareOrders =
    createV3SandboxOrderHistoryReader();

  const readSquarePayments =
    createV3SandboxPaymentEvidenceReader();

  if (
    typeof localReaders.readKnownHistory !== "function" ||
    typeof localReaders.readOwnership !== "function" ||
    typeof readPaymentLinks !== "function" ||
    typeof readSquareOrders !== "function" ||
    typeof readSquarePayments !== "function"
  ) {
    throw new Error("V3_FIVE_SOURCE_READERS_UNAVAILABLE");
  }

  const reviewService =
    createV3ServerBoundFirstPaymentReview({
      readKnownHistory: localReaders.readKnownHistory,
      readOwnership: localReaders.readOwnership,
      readPaymentLinks,
      readSquareOrders,
      readSquarePayments
    });

  return Object.freeze({
    reviewWithDiagnostics(orderId) {
      return reviewService.reviewWithDiagnostics(orderId);
    }
  });
}
