/**
 * Read-only matching of Square payment-link history.
 *
 * Positive matches indicate possible prior activity.
 * Negative matches NEVER establish payment clearance.
 * No Square calls, database writes, or payment authorization.
 */

const blocked = (reason, details = {}) => Object.freeze({
  verified: false,
  reason,
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false,
  retryAuthorized: false,
  ...details
});

export function matchV3SquareHistoryToOrder({
  orderId,
  history
} = {}) {
  const id = String(orderId || "").toLowerCase();

  if (!/^[a-f0-9]{24}$/.test(id)) {
    return blocked("INVALID_SIGNAVI_ORDER_ID");
  }

  if (
    history?.complete !== true ||
    !Array.isArray(history.links)
  ) {
    return blocked("SQUARE_HISTORY_INCOMPLETE");
  }

  // Only recognize explicit identifiers, never arbitrary
  // appearances of the order ID inside unrelated text.
  const legacyReference = new RegExp(
    `(?:^|[^a-zA-Z0-9])ID:${id}(?![a-fA-F0-9])`,
    "i"
  );

  const purchaseReference = new RegExp(
    `(?:^|[^a-zA-Z0-9])signavi-v3-production-purchase-${id}(?![a-fA-F0-9])`,
    "i"
  );

  const matchedLinkIds = [];

  for (const link of history.links) {
    if (
      !link ||
      typeof link.id !== "string" ||
      !link.id.trim()
    ) {
      return blocked("SQUARE_HISTORY_IDENTITY_INVALID");
    }

    const references = [
      link.paymentNote,
      link.description
    ].filter(value => typeof value === "string");

    if (references.some(value =>
      legacyReference.test(value) ||
      purchaseReference.test(value)
    )) {
      matchedLinkIds.push(link.id);
    }
  }

  if (matchedLinkIds.length > 0) {
    return Object.freeze({
      ...blocked("POSSIBLE_PRIOR_SQUARE_ACTIVITY"),
      priorActivityFound: true,
      matchedLinkIds: Object.freeze(matchedLinkIds)
    });
  }

  return blocked("NO_EXPLICIT_HISTORY_MATCH", {
    matchedLinkIds: Object.freeze([])
  });
}