const validOrderId = /^[a-f0-9]{24}$/;

const blocked = (orderId, reason, found = false) =>
  Object.freeze({
    orderId,
    environment: "sandbox",
    complete: false,
    reason,
    priorActivityFound: found,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });

export async function collectV3SandboxOrderRecordEvidence({
  orderId,
  listPage,
  maxPages = 10
} = {}) {
  const id = String(orderId || "").toLowerCase();

  if (!validOrderId.test(id)) {
    return blocked(id, "INVALID_ORDER_ID");
  }

  if (
    typeof listPage !== "function" ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 100
  ) {
    return blocked(id, "SQUARE_ORDER_READER_INVALID");
  }

  const references = new Set([
    `id:${id}`,
    `signavi-v3-production-purchase-${id}`,
    `signavi-v3-sandbox-${id}`,
    `signavi-v3-${id}`,
    `signavi v3 sandbox order ${id}`
  ]);

  const seenOrders = new Set();
  const seenCursors = new Set();

  let cursor = null;
  let priorActivityFound = false;

  for (let page = 0; page < maxPages; page++) {
    let response;

    try {
      response = await listPage(
        Object.freeze({ cursor, orderId: id })
      );
    } catch {
      return blocked(
        id, "SQUARE_ORDER_SEARCH_FAILED", priorActivityFound
      );
    }

    if (
      !response ||
      !Array.isArray(response.orders) ||
      (response.errors !== undefined &&
        !Array.isArray(response.errors)) ||
      (response.errors?.length ?? 0) > 0
    ) {
      return blocked(
        id, "SQUARE_ORDER_RESPONSE_INVALID", priorActivityFound
      );
    }

    for (const order of response.orders) {
      if (
        !order ||
        typeof order.id !== "string" ||
        !order.id.trim() ||
        seenOrders.has(order.id)
      ) {
        return blocked(
          id, "SQUARE_ORDER_IDENTITY_INVALID", priorActivityFound
        );
      }

      seenOrders.add(order.id);

      const reference = typeof order.referenceId === "string"
        ? order.referenceId.trim().toLowerCase()
        : "";

      const note = typeof order.note === "string"
        ? order.note.trim().toLowerCase()
        : "";

      if (
        references.has(reference) ||
        references.has(note)
      ) {
        priorActivityFound = true;
      } else if (!reference && !note) {
        return blocked(
          id, "SQUARE_ORDER_REFERENCE_MISSING",
          priorActivityFound
        );
      }
    }

    const next = response.cursor;

    if (next == null || next === "") {
      return Object.freeze({
        orderId: id,
        environment: "sandbox",
        complete: true,
        reason: priorActivityFound
          ? "POSSIBLE_PRIOR_SQUARE_ORDER"
          : "NO_EXPLICIT_SQUARE_ORDER_MATCH",
        priorActivityFound,
        authoritativeNoPriorActivity: false,
        initializationAuthorized: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    }

    if (
      typeof next !== "string" ||
      !next.trim() ||
      next.length > 4096 ||
      seenCursors.has(next)
    ) {
      return blocked(
        id, "SQUARE_ORDER_CURSOR_INVALID", priorActivityFound
      );
    }

    seenCursors.add(next);
    cursor = next;
  }

  return blocked(
    id, "SQUARE_ORDER_PAGE_LIMIT_REACHED", priorActivityFound
  );
}