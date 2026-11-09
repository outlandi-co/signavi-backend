const denied = (orderId, reason, priorActivityFound = false) =>
  Object.freeze({
    orderId,
    environment: "sandbox",
    complete: false,
    reason,
    priorActivityFound,
    authoritativeNoPriorActivity: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });

const validId = /^[a-f0-9]{24}$/;

export async function collectV3SandboxPaymentRecordEvidence({
  orderId,
  listPage,
  maxPages = 10
} = {}) {
  const id = String(orderId || "").toLowerCase();

  if (!validId.test(id)) {
    return denied(id, "INVALID_ORDER_ID");
  }

  if (typeof listPage !== "function" ||
      !Number.isSafeInteger(maxPages) ||
      maxPages < 1 || maxPages > 100) {
    return denied(id, "PAYMENT_READER_INVALID");
  }

  const references = new Set([
    `id:${id}`,
    `signavi-v3-production-purchase-${id}`,
    `signavi-v3-sandbox-${id}`,
    `signavi-v3-${id}`
  ]);

  const seenIds = new Set();
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
      return denied(id, "SQUARE_PAYMENT_READ_FAILED",
        priorActivityFound);
    }

    if (!response ||
        !Array.isArray(response.payments) ||
        (response.errors?.length ?? 0) > 0) {
      return denied(id, "SQUARE_PAYMENT_RESPONSE_INVALID",
        priorActivityFound);
    }

    for (const payment of response.payments) {
      if (!payment || typeof payment.id !== "string" ||
          !payment.id.trim() || seenIds.has(payment.id)) {
        return denied(id, "SQUARE_PAYMENT_IDENTITY_INVALID",
          priorActivityFound);
      }

      seenIds.add(payment.id);

      const reference = typeof payment.referenceId === "string"
        ? payment.referenceId.trim().toLowerCase()
        : null;

      const note = typeof payment.note === "string"
        ? payment.note.trim().toLowerCase()
        : null;

      if (references.has(reference) || references.has(note)) {
        priorActivityFound = true;
      } else if (!reference && !note) {
        // An unidentified payment cannot establish clearance.
        return denied(id, "SQUARE_PAYMENT_REFERENCE_MISSING",
          priorActivityFound);
      }
    }

    const next = response.cursor;

    if (next == null || next === "") {
      return Object.freeze({
        orderId: id,
        environment: "sandbox",
        complete: true,
        reason: priorActivityFound
          ? "POSSIBLE_PRIOR_SQUARE_PAYMENT"
          : "NO_EXPLICIT_SQUARE_PAYMENT_MATCH",
        priorActivityFound,
        authoritativeNoPriorActivity: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    }

    if (typeof next !== "string" ||
        !next.trim() ||
        next.length > 4096 ||
        seenCursors.has(next)) {
      return denied(id, "SQUARE_PAYMENT_CURSOR_INVALID",
        priorActivityFound);
    }

    seenCursors.add(next);
    cursor = next;
  }

  return denied(id, "SQUARE_PAYMENT_PAGE_LIMIT_REACHED",
    priorActivityFound);
}