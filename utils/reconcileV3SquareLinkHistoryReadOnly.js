import {
  matchV3SquareHistoryToOrder
} from "./matchV3SquareHistoryToOrder.js";

import {
  inspectV3SquareHistoryOrderNotes
} from "./inspectV3SquareHistoryOrderNotes.js";

const blocked = (reason, matches = []) => Object.freeze({
  complete: false,
  reason,
  priorActivityFound: matches.length > 0,
  matchedLinkIds: Object.freeze([...matches]),
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Read-only historical discovery workflow.
 *
 * The supplied history reader and orders client must be
 * server-controlled. Do not expose this as a public route.
 *
 * Never authorizes Square creation or retries.
 */
export async function reconcileV3SquareLinkHistoryReadOnly({
  orderId,
  historyReader,
  ordersClient
} = {}) {
  const id = String(orderId || "").toLowerCase();

  if (!/^[0-9a-f]{24}$/.test(id)) {
    return blocked("INVALID_SIGNAVI_ORDER_ID");
  }

  if (
    typeof historyReader?.collectHistory !== "function" ||
    typeof ordersClient?.get !== "function"
  ) {
    return blocked("TRUSTED_HISTORY_DEPENDENCIES_REQUIRED");
  }

  let history;

  try {
    history = await historyReader.collectHistory();
  } catch {
    return blocked("SQUARE_HISTORY_COLLECTION_FAILED");
  }

  if (
    history?.complete !== true ||
    !Array.isArray(history.links)
  ) {
    return blocked("SQUARE_HISTORY_INCOMPLETE");
  }

  const explicit = matchV3SquareHistoryToOrder({
    orderId: id,
    history
  });

  if (
    !Array.isArray(explicit.matchedLinkIds) ||
    explicit.reason === "SQUARE_HISTORY_IDENTITY_INVALID"
  ) {
    return blocked("SQUARE_HISTORY_MATCHING_FAILED");
  }

  const explicitIds = explicit.matchedLinkIds;

  const notes = await inspectV3SquareHistoryOrderNotes({
    orderId: id,
    history,
    readSquareOrder: async ({ squareOrderId }) => {
      const response = await ordersClient.get(
        { orderId: squareOrderId },
        { maxRetries: 0 }
      );

      return { order: response?.order };
    }
  });

  const matches = [
    ...new Set([
      ...explicitIds,
      ...(notes.matchedLinkIds || [])
    ])
  ];

  if (notes.complete !== true) {
    return blocked(
      notes.reason || "SQUARE_ORDER_HISTORY_INCOMPLETE",
      matches
    );
  }

  return Object.freeze({
    complete: true,
    reason: matches.length
      ? "POSSIBLE_PRIOR_SQUARE_ACTIVITY"
      : "NO_CONFIRMED_HISTORY_MATCH",
    priorActivityFound: matches.length > 0,
    matchedLinkIds: Object.freeze(matches),
    authoritativeNoPriorActivity: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}