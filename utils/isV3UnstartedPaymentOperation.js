const empty = value =>
  value === null || value === undefined || value === "";

export function isV3UnstartedPaymentOperation(operation) {
  if (
    !operation ||
    operation.environment !== "sandbox" ||
    operation.status !== "pending" ||
    operation.requestOwner !== ""
  ) {
    return false;
  }

  return [
    operation.squareCreationAttemptClaimedAt,
    operation.squareIdempotencyKey,
    operation.squarePaymentId,
    operation.squarePaymentLinkId,
    operation.squareOrderId,
    operation.paymentUrl,
    operation.squareDiagnostic,
    operation.lastError
  ].every(empty);
}