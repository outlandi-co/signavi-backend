const reject = (reason) => ({
  eligible: false,
  reason,
  mayActivate: false
});

export function validatePackingProfileActivation({
  profile,
  evidenceReviewed = false,
  administratorApproved = false
} = {}) {
  if (!profile) {
    return reject("PROFILE_MISSING");
  }

  if (profile.active === true) {
    return reject("PROFILE_ALREADY_ACTIVE");
  }

  if (
    typeof profile.unitWeightOz !== "number" ||
    !Number.isFinite(profile.unitWeightOz) ||
    profile.unitWeightOz <= 0 ||
    !Number.isSafeInteger(profile.verifiedCapacity) ||
    profile.verifiedCapacity < 1
  ) {
    return reject("PACKING_MEASUREMENTS_INVALID");
  }

  if (
    typeof profile.verifiedBy !== "string" ||
    !profile.verifiedBy.trim() ||
    typeof profile.verificationNotes !== "string" ||
    profile.verificationNotes.trim().length < 8 ||
    !profile.verifiedAt ||
    !Number.isFinite(new Date(profile.verifiedAt).getTime())
  ) {
    return reject("VERIFICATION_EVIDENCE_INCOMPLETE");
  }

  const evidence = [
    profile.verifiedBy,
    profile.verificationNotes
  ].join(" ");

  if (
    /placeholder|test.only|not.physically.verified|assumed/i.test(evidence)
  ) {
    return reject("PLACEHOLDER_EVIDENCE_REJECTED");
  }

  if (evidenceReviewed !== true) {
    return reject("EVIDENCE_REVIEW_REQUIRED");
  }

  if (administratorApproved !== true) {
    return reject("ADMINISTRATOR_APPROVAL_REQUIRED");
  }

  return {
    eligible: true,
    reason: "ACTIVATION_ELIGIBILITY_REVIEW_PASSED",
    mayActivate: false
  };
}
