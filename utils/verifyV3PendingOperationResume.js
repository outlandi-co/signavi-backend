const blocked = reason => Object.freeze({
  eligible: false,
  reason,
  paymentCreated: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const isId = value =>
  /^[0-9a-f]{24}$/.test(String(value ?? "").toLowerCase());

const empty = value =>
  value == null || value === "";

export function verifyV3PendingOperationResume({
  orderId,
  lock,
  order,
  operation,
  now = new Date()
} = {}) {
  const id = String(orderId ?? "").toLowerCase();

  if (
    !isId(id) ||
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    return blocked("INVALID_RESUME_IDENTITY");
  }

  if (
    !lock ||
    String(lock.orderId ?? lock._id).toLowerCase() !== id ||
    typeof lock.owner !== "string" ||
    !lock.owner.trim() ||
    !(lock.expiresAt instanceof Date) ||
    lock.expiresAt.getTime() <= now.getTime()
  ) {
    return blocked("ACTIVE_OWNED_LOCK_REQUIRED");
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
    operation.amountCents !== order.squareExpectedAmountCents ||
    typeof operation.idempotencyKey !== "string" ||
    !operation.idempotencyKey.startsWith("signavi-v3-sandbox-") ||
    typeof operation.checkoutReferenceId !== "string" ||
    !operation.checkoutReferenceId.trim()
  ) {
    return blocked("PENDING_OPERATION_IDENTITY_MISMATCH");
  }

  if (
    !empty(operation.squareCreationAttemptClaimedAt) ||
    !empty(operation.squareIdempotencyKey) ||
    !empty(operation.squarePaymentId) ||
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
    reason: "PENDING_OPERATION_REUSE_ELIGIBLE",
    orderId: id,
    idempotencyKey: operation.idempotencyKey,
    checkoutReferenceId: operation.checkoutReferenceId,
    amountCents: operation.amountCents,
    paymentCreated: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}