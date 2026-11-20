import {
  validatePackingProfileActivation
} from "./validatePackingProfileActivation.mjs";

export function authorizePackingProfileActivation({
  profile,
  evidenceReview,
  administratorApproval
} = {}) {
  const evidenceReviewed =
    evidenceReview?.completed === true &&
    typeof evidenceReview?.reviewerId === "string" &&
    evidenceReview.reviewerId.trim().length > 0 &&
    evidenceReview?.physicalMeasurementsConfirmed === true;

  const administratorApproved =
    administratorApproval?.approved === true &&
    typeof administratorApproval?.administratorId === "string" &&
    administratorApproval.administratorId.trim().length > 0;

  if (
    evidenceReviewed &&
    administratorApproved &&
    evidenceReview.reviewerId.trim() ===
      administratorApproval.administratorId.trim()
  ) {
    return {
      authorized: false,
      reason: "INDEPENDENT_REVIEW_REQUIRED"
    };
  }

  const result = validatePackingProfileActivation({
    profile,
    evidenceReviewed,
    administratorApproved
  });

  if (!result.eligible) {
    return {
      authorized: false,
      reason: result.reason
    };
  }

  return {
    authorized: true,
    reason: "ACTIVATION_DECISION_GUARD_PASSED"
  };
}
