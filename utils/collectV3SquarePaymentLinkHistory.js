const blocked = (reason, details = {}) => Object.freeze({
  complete: false,
  reason,
  links: Object.freeze([]),
  squareRequestAuthorized: false,
  retryAuthorized: false,
  ...details
});

export async function collectV3SquarePaymentLinkHistory({
  listPage,
  maxPages = 10
} = {}) {
  if (
    typeof listPage !== "function" ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 100
  ) {
    return blocked("INVALID_HISTORY_READER");
  }

  const links = [];
  const seen = new Set();
  let cursor;

  for (let page = 0; page < maxPages; page++) {
    let response;

    try {
      response = await listPage(
        cursor ? Object.freeze({ cursor }) : Object.freeze({})
      );
    } catch {
      return blocked("SQUARE_HISTORY_LOOKUP_FAILED");
    }

    if (
      !response ||
      typeof response !== "object" ||
      !Array.isArray(response.paymentLinks) ||
      (response.errors?.length ?? 0) > 0
    ) {
      return blocked("SQUARE_HISTORY_RESPONSE_INVALID");
    }

    for (const link of response.paymentLinks) {
      if (
        !link ||
        typeof link.id !== "string" ||
        !link.id.trim()
      ) {
        return blocked("SQUARE_HISTORY_LINK_INVALID");
      }

      if (seen.has(link.id)) {
        return blocked("SQUARE_HISTORY_DUPLICATE_LINK");
      }

      seen.add(link.id);
      links.push(Object.freeze({
        id: link.id,
        orderId: link.orderId ?? null,
        paymentNote: link.paymentNote ?? null,
        description: link.description ?? null
      }));
    }

    const next = response.cursor;

    if (next == null || next === "") {
      return Object.freeze({
        complete: true,
        reason: "PAGINATION_EXHAUSTED",
        links: Object.freeze(links),
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    }

    if (
      typeof next !== "string" ||
      next.length > 4096 ||
      next === cursor
    ) {
      return blocked("SQUARE_HISTORY_CURSOR_INVALID");
    }

    cursor = next;
  }

  return blocked("SQUARE_HISTORY_PAGE_LIMIT_REACHED");
}