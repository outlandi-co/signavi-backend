import {
  reviewV3FirstPaymentEvidenceStrict
} from "./reviewV3FirstPaymentEvidenceStrict.js";

/**
 * Review-only adapter for evidence snapshots obtained elsewhere.
 *
 * Does not authenticate reader provenance, prove Square search
 * coverage, authorize a payment, or invoke any data source.
 * Missing fields stay missing; no false values are invented.
 */

const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

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

const sourceFields = [
  "complete",
  "hasMore",
  "timedOut",
  "priorActivityFound",
  "existingPayment",
  "existingLink",
  "conflicting",
  "identityMismatch"
];

const project = (value, fields) => {
  if (!isRecord(value)) return value;

  const output = {};

  for (const field of fields) {
    if (Object.hasOwn(value, field)) {
      output[field] = value[field];
    }
  }

  return output;
};

export function adaptV3FirstPaymentReaderEvidence(
  snapshot
) {
  if (!isRecord(snapshot)) {
    return blocked("READER_SNAPSHOT_INVALID");
  }

  const evidence = {
    knownHistory: project(
      snapshot.knownHistory,
      ["knownRecordsClear"]
    ),
    ownership: project(
      snapshot.ownership,
      ["exclusive", "durable"]
    ),
    paymentLinks: project(
      snapshot.paymentLinks,
      sourceFields
    ),
    squareOrders: project(
      snapshot.squareOrders,
      sourceFields
    ),
    squarePayments: project(
      snapshot.squarePayments,
      sourceFields
    )
  };

  return reviewV3FirstPaymentEvidenceStrict(evidence);
}
