const blocked = reason => Object.freeze({
  eligible: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Candidate eligibility only.
 *
 * Provenance must eventually be written by the backend
 * during new order creation and protected from updates.
 *
 * This function is NOT a payment authorization gate.
 */
export function evaluateV3FirstAttemptEligibility({
  order
} = {}) {
  if (
    !order ||
    !/^[0-9a-f]{24}$/.test(
      String(order._id || "").toLowerCase()
    )
  ) {
    return blocked("INVALID_ORDER_IDENTITY");
  }

  if (
    !["store", "cart_drawer"].includes(
      String(order.source || "").toLowerCase()
    ) ||
    order.status !== "payment_required" ||
    order.paymentStatus !== "unpaid"
  ) {
    return blocked("ORDER_NOT_AWAITING_FIRST_PAYMENT");
  }

  if (
    order.v3FirstAttemptProvenanceVersion !== "storefront-v3-origin-v1" ||
    !Number.isFinite(Date.parse(order.v3FirstAttemptProvenanceIssuedAt)) ||
    !Number.isFinite(Date.parse(order.createdAt))
  ) {
    return blocked("SERVER_PROVENANCE_NOT_ESTABLISHED");
  }

  const issued = Date.parse(order.v3FirstAttemptProvenanceIssuedAt);
  const created = Date.parse(order.createdAt);

  // Provenance must be established during initial creation,
  // not added to an old order at a later date.
  if (
    Math.abs(issued - created) > 60_000
  ) {
    return blocked("PROVENANCE_CREATION_TIME_MISMATCH");
  }

  if (
    order.squareEnvironment != null ||
    order.squarePaymentId ||
    order.squareOrderId ||
    order.squarePaymentLinkId ||
    order.paymentUrl ||
    order.squareExpectedAmountCents != null
  ) {
    return blocked("EXISTING_SQUARE_PAYMENT_IDENTITY");
  }

  return Object.freeze({
    eligible: true,
    reason: "FIRST_ATTEMPT_CANDIDATE",
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}