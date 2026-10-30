/**
 * Testable read-only Square payment evidence inspector.
 *
 * listPage is an injected trusted adapter returning:
 * { payments: Array, cursor: string | null }
 *
 * No Square client is instantiated here.
 * No result grants checkout authorization.
 */

function blocked(reason, details = {}) {
  return Object.freeze({
    verified: false,
    noPriorPaymentActivity: false,
    cleared: false,
    squareRequestAuthorized: false,
    retryAuthorized: false,
    reason,
    ...details
  })
}

export async function inspectV3SquarePaymentPages({
  orderId,
  referenceId,
  locationId,
  beginTime,
  endTime,
  listPage,
  maxPages = 10
} = {}) {
  const validString = value =>
    typeof value === "string" && value.trim().length > 0

  if (
    !validString(orderId) ||
    !validString(referenceId) ||
    !validString(locationId) ||
    !validString(beginTime) ||
    !validString(endTime) ||
    typeof listPage !== "function" ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 50
  ) {
    return blocked("INVALID_TRUSTED_SEARCH_INPUT")
  }

  const start = Date.parse(beginTime)
  const end = Date.parse(endTime)

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end
  ) {
    return blocked("INVALID_SEARCH_WINDOW")
  }

  const seenCursors = new Set()
  let cursor = null
  let scanned = 0

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    let page

    try {
      page = await listPage(Object.freeze({
        beginTime,
        endTime,
        locationId,
        cursor,
        limit: 100
      }))
    } catch {
      return blocked("SQUARE_LIST_FAILED", {
        pagesScanned: pageNumber - 1
      })
    }

    if (
      !page ||
      typeof page !== "object" ||
      !Array.isArray(page.payments) ||
      page.payments.length > 100 ||
      !(
        page.cursor == null ||
        typeof page.cursor === "string"
      )
    ) {
      return blocked("INVALID_SQUARE_PAGE")
    }

    for (const payment of page.payments) {
      if (
        !payment ||
        typeof payment !== "object"
      ) {
        return blocked("INVALID_PAYMENT_RECORD")
      }

      scanned++

      const matched =
        payment.referenceId === referenceId ||
        payment.orderId === orderId

      if (matched) {
        return blocked("MATCHING_SQUARE_PAYMENT_FOUND", {
          pagesScanned: pageNumber,
          paymentsScanned: scanned,
          existingPayment: true
        })
      }
    }

    const nextCursor = page.cursor || null

    if (!nextCursor) {
      return blocked("SEARCH_COMPLETED_WITHOUT_CLEARANCE", {
        pagesScanned: pageNumber,
        paymentsScanned: scanned,
        historyListingCompleted: true
      })
    }

    if (
      nextCursor === cursor ||
      seenCursors.has(nextCursor)
    ) {
      return blocked("REPEATED_SQUARE_CURSOR")
    }

    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return blocked("SQUARE_PAGE_LIMIT_REACHED", {
    paymentsScanned: scanned
  })
}