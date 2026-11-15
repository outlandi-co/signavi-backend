import {
  collectV3FirstPaymentStrictReview
} from "./collectV3FirstPaymentStrictReview.js";
import {
  inspectV3SourceScopedEvidence
} from "./inspectV3SourceScopedEvidence.js";

import {
  assessV3FiveSourceConsistency
} from "./assessV3FiveSourceConsistency.js";

const readerNames = Object.freeze([
  "readKnownHistory",
  "readPaymentLinks",
  "readSquareOrders",
  "readSquarePayments",
  "readOwnership"
]);

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

/**
 * Configure once inside trusted server code.
 *
 * This factory does not authenticate dependency provenance.
 * Do not expose it as an HTTP handler or accept configuration
 * derived from browser requests.
 *
 * The resulting review() function accepts only an order ID.
 * No payment execution or database writes occur here.
 */
export function createV3ServerBoundFirstPaymentReview(
  configuredReaders
) {
  if (
    configuredReaders === null ||
    typeof configuredReaders !== "object" ||
    Array.isArray(configuredReaders)
  ) {
    throw new TypeError("V3_READER_CONFIGURATION_INVALID");
  }

  const boundReaders = {};

  for (const name of readerNames) {
    if (
      !Object.hasOwn(configuredReaders, name) ||
      typeof configuredReaders[name] !== "function"
    ) {
      throw new TypeError("V3_READER_CONFIGURATION_INCOMPLETE");
    }

    // Capture functions at configuration time.
    boundReaders[name] = configuredReaders[name];
  }

  Object.freeze(boundReaders);

  return Object.freeze({
    async review(orderId) {
      if (
        typeof orderId !== "string" ||
        !/^[0-9a-f]{24}$/.test(orderId)
      ) {
        return blocked("INVALID_ORDER_ID");
      }

      try {
        return await collectV3FirstPaymentStrictReview({
          orderId,
          environment: "sandbox",
          ...boundReaders
        });
      } catch {
        return blocked("SERVER_BOUND_REVIEW_FAILED");
      }
    },

    /**
     * Review-only diagnostic handoff.
     *
     * Captures evidence from configured readers during one
     * strict review. No additional Square reads are performed.
     * Evidence provenance is not authenticated by this factory.
     */
    async reviewWithDiagnostics(orderId) {
      const snapshot = {};
      const localSnapshot = {};
      let untrustedAuthorityClaimObserved = false;

      const sourceReaders = Object.freeze({
        readPaymentLinks: "paymentLinks",
        readSquareOrders: "squareOrders",
        readSquarePayments: "squarePayments"
      });

      const wrappedReaders = { ...boundReaders };

      for (const [readerName, sourceName] of
        Object.entries(sourceReaders)) {
        const reader = boundReaders[readerName];

        wrappedReaders[readerName] = async (...args) => {
          const evidence = await reader(...args);
          snapshot[sourceName] = evidence;

          const forbiddenClaims = [
            "authoritativeNoPriorActivity",
            "initializationAuthorized",
            "squareRequestAuthorized",
            "retryAuthorized",
            "provenanceVerified",
            "trustedForReconciliation",
            "authoritativeAbsenceEstablished",
            "safeForAuthorization"
          ];

          if (
            evidence !== null &&
            typeof evidence === "object" &&
            forbiddenClaims.some(
              field => evidence[field] === true
            )
          ) {
            untrustedAuthorityClaimObserved = true;
          }

          return evidence;
        };
      }

      // Capture local readers during the same strict review.
      // These values are reports, not trusted clearance.
      for (const [readerName, sourceName] of [
        ["readKnownHistory", "knownHistory"],
        ["readOwnership", "ownership"]
      ]) {
        const reader = boundReaders[readerName];

        wrappedReaders[readerName] = async (...args) => {
          const evidence = await reader(...args);
          localSnapshot[sourceName] = evidence;
          return evidence;
        };
      }

      let reviewResult;

      if (
        typeof orderId !== "string" ||
        !/^[0-9a-f]{24}$/.test(orderId)
      ) {
        reviewResult = blocked("INVALID_ORDER_ID");
      } else {
        try {
          reviewResult = await collectV3FirstPaymentStrictReview({
            orderId,
            environment: "sandbox",
            ...wrappedReaders
          });
        } catch {
          reviewResult = blocked("SERVER_BOUND_REVIEW_FAILED");
        }
      }

      if (untrustedAuthorityClaimObserved) {
        reviewResult = blocked(
          "UNTRUSTED_SOURCE_AUTHORITY_CLAIM"
        );
      }

      // The inspector always treats snapshot provenance as
      // unverified. It cannot authorize reconciliation.
      const diagnostics = inspectV3SourceScopedEvidence({
        orderId,
        snapshot
      });

      const describeLocalSource = (name) => {
        const evidence = localSnapshot[name];

        const present =
          evidence !== null &&
          typeof evidence === "object" &&
          !Array.isArray(evidence);

        const identityMatched =
          present &&
          evidence.orderId === orderId &&
          evidence.environment === "sandbox";

        const reportedComplete =
          identityMatched &&
          evidence.complete === true;

        return Object.freeze({
          present,
          identityMatched: Boolean(identityMatched),
          reportedComplete: Boolean(reportedComplete),
          observation: !identityMatched
            ? "UNVERIFIED"
            : reportedComplete
              ? "REPORTED_COMPLETE_NO_CLEARANCE"
              : "REPORTED_INCOMPLETE",

          // Distinct reports, never authoritative facts.
          reportedKnownRecordsClear:
            name === "knownHistory" &&
            identityMatched &&
            evidence.knownRecordsClear === true,

          reportedExclusive:
            name === "ownership" &&
            identityMatched &&
            evidence.exclusive === true,

          reportedDurable:
            name === "ownership" &&
            identityMatched &&
            evidence.durable === true,

          provenanceVerified: false,
          trustedForReconciliation: false,
          safeForAuthorization: false
        });
      };

      const fiveSourceDiagnostics = Object.freeze({
        knownHistory: describeLocalSource("knownHistory"),
        ownership: describeLocalSource("ownership"),

        // Reuse the existing Square diagnostic objects.
        paymentLinks: diagnostics.sources.paymentLinks,
        squareOrders: diagnostics.sources.squareOrders,
        squarePayments: diagnostics.sources.squarePayments,

        // A completed read does not establish authoritative
        // negative history, ownership, or payment clearance.
        unresolvedSourceCount: 5,
        authoritativeNoPriorActivity: false,
        initializationAuthorized: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });

      const crossSourceReconciliation =
        assessV3FiveSourceConsistency(
          fiveSourceDiagnostics
        );

      return Object.freeze({
        review: reviewResult,
        diagnostics,
        fiveSourceDiagnostics,
        crossSourceReconciliation,

        // No combination of review and diagnostic output
        // can authorize payment creation.
        readyForAuthorizationReview: false,
        authoritativeNoPriorActivity: false,
        initializationAuthorized: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    }
  });
}
