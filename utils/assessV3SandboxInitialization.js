const blocked = reason => Object.freeze({
  eligible: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const empty = value =>
  value === null || value === undefined || value === "";

const idOf = value =>
  String(value ?? "").toLowerCase();

export function assessV3SandboxInitialization({
  storefrontOrder,
  storefrontOperation,
  sandboxOrder,
  sandboxOperation
} = {}) {
  const id = idOf(storefrontOrder?._id);

  if (!/^[a-f0-9]{24}$/.test(id)) {
    return blocked("INVALID_ORDER_ID");
  }

  if (
    storefrontOrder.status !== "payment_required" ||
    storefrontOrder.paymentStatus !== "unpaid" ||
    !["store", "cart_drawer"].includes(
      String(storefrontOrder.source ?? "").toLowerCase()
    ) ||
    String(storefrontOrder.currency ?? "").toUpperCase() !== "USD" ||
    storefrontOrder.squareEnvironment !== "sandbox" ||
    !Number.isSafeInteger(
      storefrontOrder.squareExpectedAmountCents
    ) ||
    storefrontOrder.squareExpectedAmountCents <= 0
  ) {
    return blocked("STOREFRONT_ORDER_NOT_ELIGIBLE");
  }

  if (
    !empty(storefrontOrder.squarePaymentId) ||
    !empty(storefrontOrder.squarePaymentLinkId) ||
    !empty(storefrontOrder.squareOrderId) ||
    !empty(storefrontOrder.paymentUrl) ||
    !empty(storefrontOrder.paidAt)
  ) {
    return blocked("STOREFRONT_PAYMENT_EVIDENCE_PRESENT");
  }

  if (
    !storefrontOperation ||
    idOf(storefrontOperation.orderId) !== id ||
    storefrontOperation.status !== "pending" ||
    storefrontOperation.environment !== "sandbox" ||
    storefrontOperation.requestOwner !== "" ||
    storefrontOperation.amountCents !==
      storefrontOrder.squareExpectedAmountCents ||
    typeof storefrontOperation.idempotencyKey !== "string" ||
    !storefrontOperation.idempotencyKey.startsWith(
      "signavi-v3-sandbox-"
    ) ||
    typeof storefrontOperation.checkoutReferenceId !== "string" ||
    !storefrontOperation.checkoutReferenceId.trim()
  ) {
    return blocked("STOREFRONT_OPERATION_NOT_ELIGIBLE");
  }

  if (
    !empty(storefrontOperation.squareCreationAttemptClaimedAt) ||
    !empty(storefrontOperation.squareIdempotencyKey) ||
    !empty(storefrontOperation.squarePaymentId) ||
    !empty(storefrontOperation.squarePaymentLinkId) ||
    !empty(storefrontOperation.squareOrderId) ||
    !empty(storefrontOperation.paymentUrl) ||
    !empty(storefrontOperation.squareDiagnostic) ||
    !empty(storefrontOperation.lastError)
  ) {
    return blocked("PAYMENT_CREATION_EVIDENCE_PRESENT");
  }

  if (sandboxOrder || sandboxOperation) {
    return blocked("SANDBOX_RECORD_ALREADY_EXISTS");
  }

  return Object.freeze({
    eligible: true,
    reason: "SANDBOX_INITIALIZATION_CANDIDATE",
    orderId: id,
    amountCents: storefrontOperation.amountCents,
    checkoutReferenceId:
      storefrontOperation.checkoutReferenceId,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}