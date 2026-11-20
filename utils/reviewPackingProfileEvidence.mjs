const REQUIRED = Object.freeze([
  "MEASURED_UNIT_WEIGHT",
  "PHYSICAL_CAPACITY_TEST",
  "PACKAGE_WEIGHT_LIMIT_CHECK",
  "REVIEWER_IDENTITY",
  "VERIFICATION_DATE",
  "EVIDENCE_REFERENCE",
  "ADMINISTRATOR_APPROVAL"
]);

export function reviewPackingProfileEvidence({
  profile,
  evidence = {}
} = {}) {
  const missing = [];

  // Structural checks only, never proof of physical verification.
  const checks = {
    MEASURED_UNIT_WEIGHT:
      Number.isFinite(profile?.unitWeightOz) &&
      profile.unitWeightOz > 0,

    PHYSICAL_CAPACITY_TEST:
      Number.isSafeInteger(profile?.verifiedCapacity) &&
      profile.verifiedCapacity > 0,

    PACKAGE_WEIGHT_LIMIT_CHECK:
      evidence.packageWeightChecked === true,

    REVIEWER_IDENTITY:
      typeof profile?.verifiedBy === "string" &&
      profile.verifiedBy.trim().length > 0,

    VERIFICATION_DATE:
      !!profile?.verifiedAt &&
      Number.isFinite(new Date(profile.verifiedAt).getTime()),

    EVIDENCE_REFERENCE:
      typeof evidence.reference === "string" &&
      evidence.reference.trim().length > 0,

    ADMINISTRATOR_APPROVAL:
      evidence.administratorApproved === true
  };

  for (const requirement of REQUIRED) {
    if (!checks[requirement]) {
      missing.push(requirement);
    }
  }

  return {
    reviewComplete: false,
    structurallyComplete: missing.length === 0,
    missing,
    requiresIndependentEvidenceReview: true,
    mayActivateProfile: false,
    mayExecutePayment: false
  };
}
