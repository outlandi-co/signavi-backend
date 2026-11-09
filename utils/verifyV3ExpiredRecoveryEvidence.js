const blocked = reason => Object.freeze({
  eligible: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const validId = value =>
  /^[a-f0-9]{24}$/.test(String(value ?? "").toLowerCase());

const empty = value =>
  value === null || value === undefined || value === "";

export function verifyV3ExpiredRecoveryEvidence({
  orderId,
  owner,
  now,
  lock,
  order,
  operation
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (
    !validId(id) ||
    typeof owner !== "string" ||
    !owner.trim() ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    return blocked("INVALID_RECOVERY_IDENTITY");
  }

  if (
    !lock ||
    String(lock._id).toLowerCase() !== id ||
    lock.owner !== owner ||
    !(lock.expiresAt instanceof Date) ||
    !Number.isFinite(lock.expiresAt.getTime()) ||
    lock.expiresAt.getTime() > now.getTime()
  ) {
    return blocked("EXPIRED_OWNED_LOCK_REQUIRED");
  }

  if (
    !order ||
    String(order._id).toLowerCase() !== id ||
    order.status !== "payment_required" ||
    order.paymentStatus !== "unpaid" ||
    order.squareEnvironment !== "sandbox" ||
    !Number.isSafeInteger(order.squareExpectedAmountCents) ||
    order.squareExpectedAmountCents < 1
  ) {
    return blocked("UNPAID_SANDBOX_ORDER_REQUIRED");
  }

  if (
    !empty(order.squarePaymentId) ||
    !empty(order.squarePaymentLinkId) ||
    !empty(order.squareOrderId) ||
    !empty(order.paymentUrl) ||
    !empty(order.paidAt)
  ) {
    return blocked("ORDER_PAYMENT_EVIDENCE_PRESENT");
  }

  if (
    !operation ||
    String(operation.orderId).toLowerCase() !== id ||
    operation.environment !== "sandbox" ||
    operation.status !== "pending" ||
    operation.requestOwner !== "" ||
    operation.amountCents !== order.squareExpectedAmountCents
  ) {
    return blocked("PRISTINE_PAYMENT_OPERATION_REQUIRED");
  }

  if (
    !empty(operation.squareCreationAttemptClaimedAt) ||
    !empty(operation.squareIdempotencyKey) ||
    !empty(operation.squarePaymentLinkId) ||
    !empty(operation.squareOrderId) ||
    !empty(operation.paymentUrl) ||
    !empty(operation.squareDiagnostic) ||
    !empty(operation.lastError)
  ) {
    return blocked("PAYMENT_CREATION_EVIDENCE_PRESENT");
  }

  return Object.freeze({
    eligible: true,
    reason: "EXPIRED_UNSTARTED_EVIDENCE_VERIFIED",
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}