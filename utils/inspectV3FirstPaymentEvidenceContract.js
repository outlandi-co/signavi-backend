const squareFields = Object.freeze([
  "complete",
  "hasMore",
  "timedOut",
  "priorActivityFound",
  "existingPayment",
  "existingLink",
  "conflicting",
  "identityMismatch"
]);

const requirements = Object.freeze({
  knownHistory: Object.freeze(["knownRecordsClear"]),
  paymentLinks: squareFields,
  squareOrders: squareFields,
  squarePayments: squareFields,
  ownership: Object.freeze(["exclusive", "durable"])
});

const authorityFields = Object.freeze([
  "authoritativeNoPriorActivity",
  "initializationAuthorized",
  "squareRequestAuthorized",
  "retryAuthorized"
]);

export function inspectV3FirstPaymentEvidenceContract(
  snapshot
) {
  const isRecord = value =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);

  const sources = {};
  let missingFieldCount = 0;
  let unsafeSourceCount = 0;

  for (const [source, fields] of Object.entries(requirements)) {
    const record = isRecord(snapshot)
      ? snapshot[source]
      : undefined;

    const validRecord = isRecord(record);

    const missingFields = fields.filter(
      field =>
        !validRecord ||
        typeof record[field] !== "boolean"
    );

    const raisedAuthority = validRecord
      ? authorityFields.filter(
          field => record[field] === true
        )
      : [];

    const complete =
      validRecord && record.complete === true;

    const unsafe =
      !validRecord ||
      !complete ||
      missingFields.length > 0 ||
      raisedAuthority.length > 0 ||
      (
        source === "knownHistory" &&
        record.knownRecordsClear !== true
      ) ||
      (
        source === "ownership" &&
        (
          record.exclusive !== true ||
          record.durable !== true
        )
      ) ||
      (
        ["paymentLinks", "squareOrders", "squarePayments"]
          .includes(source) &&
        (
          record.priorActivityFound !== false ||
          record.hasMore !== false ||
          record.timedOut !== false ||
          record.existingPayment !== false ||
          record.existingLink !== false ||
          record.conflicting !== false ||
          record.identityMismatch !== false
        )
      );

    missingFieldCount += missingFields.length;

    if (unsafe) {
      unsafeSourceCount++;
    }

    sources[source] = Object.freeze({
      present: validRecord,
      complete,
      reason: validRecord &&
        typeof record.reason === "string"
          ? record.reason
          : "UNKNOWN",
      missingFields: Object.freeze(missingFields),
      raisedAuthority: Object.freeze(raisedAuthority),
      unsafe
    });
  }

  return Object.freeze({
    assessed: true,
    // Diagnostics never authorize ownership or payment creation.
    readyForAuthorizationReview: false,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false,
    missingFieldCount,
    unsafeSourceCount,
    sources: Object.freeze(sources)
  });
}