const VALID_STOREFRONTS = new Set([
  "signavi_store",
  "signavi_studio"
]);

const EVIDENCE_SOURCES = new Set([
  "creation_event",
  "payment_operation",
  "invoice_association"
]);

function result(classification, reason, sources = []) {
  return Object.freeze({
    classification,
    reason,
    evidenceSources: Object.freeze([...sources].sort()),
    ownershipVerified: false,
    migrationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}

// Read-only triage. Evidence is supplied by the caller;
// this function does NOT authenticate that evidence.
// It never verifies ownership or authorizes migration.
export function classifyHistoricalOrderOwnership({
  order,
  evidence = []
} = {}) {
  const orderId = String(order?._id ?? "").toLowerCase();

  if (!/^[a-f0-9]{24}$/.test(orderId)) {
    return result("unclassified", "INVALID_ORDER_ID");
  }

  if (!Array.isArray(evidence)) {
    return result("unclassified", "INVALID_EVIDENCE");
  }

  if (evidence.length === 0) {
    return result("unclassified", "NO_INDEPENDENT_EVIDENCE");
  }

  const origins = new Set();
  const sources = new Set();

  for (const entry of evidence) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      String(entry.orderId ?? "").toLowerCase() !== orderId ||
      !VALID_STOREFRONTS.has(entry.storefront) ||
      !EVIDENCE_SOURCES.has(entry.source)
    ) {
      return result("unclassified", "INVALID_OR_MISMATCHED_EVIDENCE");
    }

    origins.add(entry.storefront);
    sources.add(entry.source);
  }

  const usedSources = [...sources];

  if (origins.size > 1) {
    return result(
      "conflicting",
      "CONTRADICTORY_STOREFRONT_EVIDENCE",
      usedSources
    );
  }

  if (origins.has("signavi_store")) {
    return result(
      "store_candidate",
      "STORE_EVIDENCE_REQUIRES_INDEPENDENT_VERIFICATION",
      usedSources
    );
  }

  if (origins.has("signavi_studio")) {
    return result(
      "studio_candidate",
      "STUDIO_EVIDENCE_REQUIRES_INDEPENDENT_VERIFICATION",
      usedSources
    );
  }

  return result("unclassified", "INSUFFICIENT_EVIDENCE");
}
