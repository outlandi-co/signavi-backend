/**
 * Read-only inspection of Square orders behind payment links.
 *
 * Positive evidence means prior activity requires reconciliation.
 * Negative results never authorize Square payment creation.
 */
const result = (reason, matchedLinkIds = [], complete = false) =>
  Object.freeze({
    verified: false,
    complete,
    reason,
    priorActivityFound: matchedLinkIds.length > 0,
    matchedLinkIds: Object.freeze([...matchedLinkIds]),
    authoritativeNoPriorActivity: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });

export async function inspectV3SquareHistoryOrderNotes({
  orderId,
  history,
  readSquareOrder
} = {}) {
  const id = String(orderId || "").toLowerCase();

  if (!/^[a-f0-9]{24}$/.test(id)) {
    return result("INVALID_SIGNAVI_ORDER_ID");
  }

  if (
    history?.complete !== true ||
    !Array.isArray(history.links)
  ) {
    return result("SQUARE_HISTORY_INCOMPLETE");
  }

  if (typeof readSquareOrder !== "function") {
    return result("SQUARE_ORDER_READER_REQUIRED");
  }

  const matched = [];
  let incompleteEvidence = false;
  const seenOrders = new Set();
  const seenLinks = new Set();

  for (const link of history.links) {
    if (
      !link ||
      typeof link.id !== "string" ||
      !link.id.trim() ||
      typeof link.orderId !== "string" ||
      !link.orderId.trim() ||
      seenLinks.has(link.id) ||
      seenOrders.has(link.orderId)
    ) {
      return result("SQUARE_ORDER_IDENTITY_INCOMPLETE", matched);
    }

    seenLinks.add(link.id);
    seenOrders.add(link.orderId);

    let response;

    try {
      response = await readSquareOrder({
        squareOrderId: link.orderId
      });
    } catch {
      return result("SQUARE_ORDER_LOOKUP_FAILED", matched);
    }

    const order = response?.order;

    if (!order || order.id !== link.orderId) {
      return result("SQUARE_ORDER_EVIDENCE_INCOMPLETE", matched);
    }

    const expectedReferences = new Set([
      `id:${id}`,
      `signavi-v3-production-purchase-${id}`,
      `signavi-v3-sandbox-${id}`,
      `signavi-v3-${id}`,
      `signavi v3 sandbox order ${id}`
    ]);

    const note = typeof order.note === "string"
      ? order.note.trim().toLowerCase()
      : null;

    const referenceId = typeof order.referenceId === "string"
      ? order.referenceId.trim().toLowerCase()
      : null;

    if (
      expectedReferences.has(note) ||
      expectedReferences.has(referenceId)
    ) {
      matched.push(link.id);
      continue;
    }

    // Missing notes without a matching reference remain
    // incomplete evidence, never proof of no prior activity.
    if (note === null) {
      incompleteEvidence = true;
    }
  }

  // Inspect all available orders before returning.
  // An incomplete identity never establishes clearance.
  if (incompleteEvidence) {
    return result("SQUARE_ORDER_EVIDENCE_INCOMPLETE", matched);
  }

  return matched.length
    ? result("PRIOR_SQUARE_ORDER_FOUND", matched, true)
    : result("NO_CONFIRMED_SQUARE_ORDER_MATCH", [], true);
}