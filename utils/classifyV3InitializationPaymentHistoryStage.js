const blocked = reason => Object.freeze({
  candidate: false,
  reason,
  paymentHistoryVerified: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const empty = value =>
  value === undefined ||
  value === null ||
  value === "";

export function classifyV3InitializationPaymentHistoryStage({
  orderId,
  amountCents,
  operation,
  knownHistory
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (!/^[0-9a-f]{24}$/.test(id)) {
    return blocked("INVALID_ORDER_ID");
  }

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return blocked("INVALID_AMOUNT");
  }

  if (!operation) {
    return blocked("PENDING_OPERATION_REQUIRED");
  }

  if (
    String(operation.orderId ?? "").toLowerCase() !== id ||
    operation.environment !== "sandbox" ||
    operation.status !== "pending" ||
    operation.amountCents !== amountCents ||
    !String(operation.checkoutReferenceId ?? "").trim() ||
    !String(operation.idempotencyKey ?? "").startsWith(
      "signavi-v3-sandbox-"
    )
  ) {
    return blocked("OPERATION_IDENTITY_MISMATCH");
  }

  const paymentFields = [
    "squareCreationAttemptClaimedAt",
    "squareIdempotencyKey",
    "squarePaymentId",
    "squarePaymentLinkId",
    "squareOrderId",
    "paymentUrl",
    "squareDiagnostic",
    "lastError",
    "requestOwner"
  ];

  if (paymentFields.some(field => !empty(operation[field]))) {
    return blocked("PAYMENT_ACTIVITY_OR_UNCERTAINTY_PRESENT");
  }

  if (!knownHistory || knownHistory.verified !== false) {
    return blocked("KNOWN_HISTORY_CONTRACT_UNCERTAIN");
  }

  if (
    knownHistory.source &&
    knownHistory.source !== "SmartShippingV3PaymentOperation"
  ) {
    return blocked("OTHER_PAYMENT_HISTORY_PRESENT");
  }

  if (
    knownHistory.knownRecordsClear === false &&
    knownHistory.source !== "SmartShippingV3PaymentOperation"
  ) {
    return blocked("KNOWN_HISTORY_NOT_CLEAR");
  }

  // An untouched pending operation may be distinguished from a
  // previously started payment. This does NOT prove absence of
  // external Square activity or authorize any database write.
  return Object.freeze({
    candidate: true,
    reason: "PRISTINE_PENDING_OPERATION_ONLY",
    paymentHistoryVerified: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}