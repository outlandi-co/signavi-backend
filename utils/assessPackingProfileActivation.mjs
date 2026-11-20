import {
  validatePackingProfileActivation
} from "./validatePackingProfileActivation.mjs";

import {
  reviewPackingProfileEvidence
} from "./reviewPackingProfileEvidence.mjs";

export function assessPackingProfileActivation({
  profile,
  evidence = {}
} = {}) {
  const checklist = reviewPackingProfileEvidence({
    profile,
    evidence
  });

  // These flags evaluate supplied data only.
  // They never authorize a database write.
  const eligibility = validatePackingProfileActivation({
    profile,
    evidenceReviewed: true,
    administratorApproved: true
  });

  return {
    status: "REVIEW_ONLY",
    eligibleForFurtherReview:
      eligibility.eligible === true &&
      checklist.structurallyComplete === true,
    eligibilityReason: eligibility.reason,
    missingEvidence: checklist.missing,
    structurallyComplete: checklist.structurallyComplete,
    reviewComplete: false,
    requiresIndependentEvidenceReview: true,
    mayActivateProfile: false,
    mayExecutePayment: false
  };
}
