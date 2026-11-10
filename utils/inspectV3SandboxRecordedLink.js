const deny = reason => Object.freeze({
  eligible: false,
  reason,
  httpReleaseAuthorized: false,
  squareRequestAuthorized: false
});

export function inspectV3SandboxRecordedLink({
  order,
  operation,
  ownership
} = {}) {
  if (!order || !operation || !ownership) {
    return deny("MISSING_RECORDS");
  }

  const orderId = String(order._id ?? "").toLowerCase();

  if (!/^[0-9a-f]{24}$/.test(orderId)) {
    return deny("INVALID_ORDER_ID");
  }

  if (
    order.source !== "store" ||
    String(operation.orderId ?? "").toLowerCase() !== orderId ||
    ownership.environment !== "sandbox" ||
    ownership.purchaseKey !== `order:${orderId}` ||
    ownership.claimedByDocumentType !== "order" ||
    String(ownership.claimedByDocumentId ?? "").toLowerCase() !== orderId
  ) {
    return deny("OWNERSHIP_MISMATCH");
  }

  if (
    order.squareEnvironment !== "sandbox" ||
    operation.environment !== "sandbox" ||
    String(order.currency ?? "").toLowerCase() !== "usd" ||
    !Number.isSafeInteger(order.squareExpectedAmountCents) ||
    order.squareExpectedAmountCents <= 0 ||
    operation.amountCents !== order.squareExpectedAmountCents
  ) {
    return deny("PAYMENT_BINDING_MISMATCH");
  }

  if (
    !["pending", "payment_required"].includes(order.status) ||
    String(order.paymentStatus ?? "").toLowerCase() === "paid"
  ) {
    return deny("ORDER_NOT_PAYABLE");
  }

  if (
    operation.checkoutReferenceId !== `signavi-v3-${orderId}` ||
    !/^signavi-v3-sandbox-[0-9a-f-]{36}$/i.test(
      operation.idempotencyKey ?? ""
    )
  ) {
    return deny("PAYMENT_IDENTITY_MISMATCH");
  }

  if (
    operation.status !== "completed" ||
    typeof operation.requestOwner !== "string" ||
    !operation.requestOwner.trim() ||
    !operation.squareCreationAttemptClaimedAt ||
    !String(operation.squarePaymentLinkId ?? "").trim() ||
    !String(operation.squareOrderId ?? "").trim()
  ) {
    return deny("LINK_NOT_DURABLY_RECORDED");
  }

  let url;

  try {
    url = new URL(operation.paymentUrl);
  } catch {
    return deny("INVALID_PAYMENT_URL");
  }

  const allowedHosts = new Set([
    "square.link",
    "sandbox.square.link",
    "checkout.square.site"
  ]);

  if (
    url.protocol !== "https:" ||
    !allowedHosts.has(url.hostname.toLowerCase()) ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname ||
    url.pathname === "/"
  ) {
    return deny("UNTRUSTED_PAYMENT_URL");
  }

  // Eligibility only. Independent Square link evidence,
  // HTTP caller authorization and URL release remain separate.
  return Object.freeze({
    eligible: true,
    reason: "RECORDED_LINK_CANDIDATE",
    orderId,
    paymentOperationId: String(operation._id),
    httpReleaseAuthorized: false,
    squareRequestAuthorized: false
  });
}