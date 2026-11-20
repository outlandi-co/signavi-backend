const COLLECTION = "shippingproductpackageprofiles";

const INDEX = Object.freeze({
  name: "productId_1_packageId_1",
  key: Object.freeze({
    productId: 1,
    packageId: 1
  }),
  unique: true
});

const result = (reason, action, specification = null) =>
  Object.freeze({
    reason,
    action,
    specification,
    reviewRequired: action !== "none",
    mayCreateCollection: false,
    mayCreateIndex: false,
    mayCreateProfile: false,
    mayActivateProfile: false,
    mayExecutePayment: false
  });

export function planShippingProfileProvisioningReview({
  expectedDatabase,
  preflight,
  duplicateCount
} = {}) {
  // This planner addresses the legacy production shipping path.
  // Isolated Studio provisioning requires a separate review.
  if (expectedDatabase !== "signavi_store") {
    return result("DATABASE_NOT_APPROVED_FOR_THIS_PLAN", "stop");
  }

  if (!preflight || preflight.writesAuthorized !== false) {
    return result("PREFLIGHT_EVIDENCE_INVALID", "stop");
  }

  if (
    preflight.ready === true &&
    preflight.reason === "PROFILE_COLLECTION_AND_INDEX_VERIFIED"
  ) {
    return result("INDEX_ALREADY_VERIFIED", "none");
  }

  if (
    preflight.ready !== false ||
    typeof preflight.reason !== "string"
  ) {
    return result("PREFLIGHT_EVIDENCE_INVALID", "stop");
  }

  if (preflight.reason === "PROFILE_COLLECTION_MISSING") {
    return result("COLLECTION_CREATION_REVIEW_REQUIRED", "review", {
      database: expectedDatabase,
      collection: COLLECTION,
      proposedIndex: INDEX,
      requiresSeparateExecutionApproval: true
    });
  }

  if (preflight.reason === "SHIPPING_PROFILE_UNIQUE_INDEX_MISSING") {
    if (!Number.isSafeInteger(duplicateCount) || duplicateCount < 0) {
      return result("DUPLICATE_AUDIT_REQUIRED", "stop");
    }

    if (duplicateCount !== 0) {
      return result("DUPLICATE_PROFILE_PAIRS_FOUND", "stop");
    }

    return result("UNIQUE_INDEX_REVIEW_REQUIRED", "review", {
      database: expectedDatabase,
      collection: COLLECTION,
      proposedIndex: INDEX,
      auditedDuplicatePairs: duplicateCount,
      requiresSeparateExecutionApproval: true
    });
  }

  return result("MIGRATION_PREFLIGHT_BLOCKED", "stop");
}