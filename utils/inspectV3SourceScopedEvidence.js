const OBJECT_ID = /^[a-f0-9]{24}$/;

const SOURCE_FIELDS = Object.freeze({
  paymentLinks: "existingLink",
  squareOrders: "existingOrder",
  squarePayments: "existingPayment"
});

const isRecord = value =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

export function inspectV3SourceScopedEvidence({
  orderId,
  snapshot
} = {}) {
  const id = String(orderId ?? "").trim().toLowerCase();
  const validId = OBJECT_ID.test(id);

  const sources = {};
  let observedActivityCount = 0;
  let unresolvedSourceCount = 0;

  for (const [name, positiveField] of
    Object.entries(SOURCE_FIELDS)) {

    const record = isRecord(snapshot)
      ? snapshot[name]
      : undefined;

    const present = isRecord(record);

    const identityMatched =
      validId &&
      present &&
      record.orderId === id &&
      record.environment === "sandbox";

    const ownPositive =
      identityMatched &&
      record[positiveField] === true;

    const reportedPriorActivity =
      identityMatched &&
      record.priorActivityFound === true;

    const positiveObserved =
      ownPositive || reportedPriorActivity;

    const complete =
      identityMatched &&
      record.complete === true;

    const contradictory =
      ownPositive &&
      record.priorActivityFound === false;

    const validStatus =
      identityMatched &&
      typeof record.complete === "boolean" &&
      typeof record.priorActivityFound === "boolean" &&
      !contradictory;

    const observation = !validStatus
      ? "UNVERIFIED"
      : positiveObserved
        ? "PRIOR_ACTIVITY_OBSERVED"
        : complete
          ? "REPORTED_COMPLETE_NO_CLEARANCE"
          : "REPORTED_INCOMPLETE";

    if (positiveObserved) {
      observedActivityCount++;
    }

    // No reader can certify authoritative absence.
    // Every source remains unresolved for authorization.
    unresolvedSourceCount++;

    sources[name] = Object.freeze({
      present,
      identityMatched: Boolean(identityMatched),
      // Matching claimed fields does not authenticate the source.
      provenanceVerified: false,
      trustedForReconciliation: false,
      reportedComplete: Boolean(complete),
      positiveField,
      positiveObserved: Boolean(positiveObserved),
      contradictory: Boolean(contradictory),
      observation,
      reason: present && typeof record.reason === "string"
        ? record.reason
        : "UNKNOWN",
      authoritativeAbsenceEstablished: false,
      safeForAuthorization: false
    });
  }

  return Object.freeze({
    assessed: true,
    orderId: id,
    validOrderId: validId,
    observedActivityCount,
    unresolvedSourceCount,
    sources: Object.freeze(sources),

    // This module is diagnostic only.
    readyForAuthorizationReview: false,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}
