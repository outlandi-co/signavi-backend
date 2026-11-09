const blocked = reason => Object.freeze({
  verified: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

const idOf = value => String(value ?? "").toLowerCase();

export function verifyV3CrossDatabaseBinding({
  storefrontDatabase,
  sandboxDatabase,
  storefrontOrder,
  sandboxOrder,
  sandboxOperation,
  verifiedShipping
} = {}) {
  if (
    storefrontDatabase !== "signavi_store" ||
    sandboxDatabase !== "signavi_shipping_v3_dev" ||
    storefrontDatabase === sandboxDatabase
  ) {
    return blocked("DATABASE_BOUNDARY_MISMATCH");
  }

  if (
    !storefrontOrder ||
    !sandboxOrder ||
    !sandboxOperation ||
    !verifiedShipping
  ) {
    return blocked("BINDING_EVIDENCE_MISSING");
  }

  const id = idOf(storefrontOrder._id);

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    idOf(sandboxOrder._id) !== id ||
    idOf(sandboxOperation.orderId) !== id ||
    idOf(verifiedShipping.orderId) !== id
  ) {
    return blocked("CROSS_DATABASE_ORDER_MISMATCH");
  }

  if (
    !["store", "cart_drawer"].includes(
      String(storefrontOrder.source ?? "").toLowerCase()
    ) ||
    !["payment_required", "pending"].includes(
      storefrontOrder.status
    ) ||
    storefrontOrder.paymentStatus !== "unpaid" ||
    String(storefrontOrder.currency ?? "").toUpperCase() !== "USD"
  ) {
    return blocked("STOREFRONT_ORDER_NOT_PAYABLE");
  }

  if (
    storefrontOrder.paymentUrl ||
    storefrontOrder.squarePaymentId ||
    storefrontOrder.squarePaymentLinkId ||
    storefrontOrder.squareOrderId
  ) {
    return blocked("STOREFRONT_PAYMENT_ALREADY_EXISTS");
  }

  const amount = storefrontOrder.squareExpectedAmountCents;

  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    sandboxOrder.squareExpectedAmountCents !== amount ||
    sandboxOperation.amountCents !== amount
  ) {
    return blocked("CROSS_DATABASE_AMOUNT_MISMATCH");
  }

  if (
    sandboxOrder.squareEnvironment !== "sandbox" ||
    sandboxOperation.environment !== "sandbox" ||
    sandboxOperation.status !== "pending" ||
    sandboxOperation.requestOwner ||
    sandboxOperation.paymentUrl ||
    sandboxOperation.squarePaymentLinkId ||
    sandboxOperation.squareOrderId
  ) {
    return blocked("SANDBOX_PAYMENT_STATE_UNSAFE");
  }

  if (
    !Number.isSafeInteger(
      verifiedShipping.shippingAmountCents
    ) ||
    verifiedShipping.shippingAmountCents <= 0 ||
    verifiedShipping.shippingAmountCents > amount
  ) {
    return blocked("SHIPPING_EVIDENCE_MISMATCH");
  }

  // These comparisons are necessary but NOT sufficient.
  // Invoice associations, external Square history, concurrent
  // writes and authoritative read provenance remain unresolved.
  return Object.freeze({
    verified: true,
    orderId: id,
    amountCents: amount,
    reason: "CROSS_DATABASE_RECORDS_CONSISTENT_ONLY",
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}