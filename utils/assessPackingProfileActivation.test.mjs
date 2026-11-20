import test from "node:test";
import assert from "node:assert/strict";

import {
  assessPackingProfileActivation
} from "./assessPackingProfileActivation.mjs";

const profile = {
  active: false,
  unitWeightOz: 6,
  verifiedCapacity: 4,
  verifiedBy: "DEVELOPMENT_PLACEHOLDER_NOT_PHYSICALLY_VERIFIED",
  verifiedAt: "2026-11-20",
  verificationNotes: "TEST ONLY. Assumed packing capacity."
};

const claimedEvidence = {
  packageWeightChecked: true,
  reference: "UNVERIFIED-TEST-REFERENCE",
  administratorApproved: true
};

test("rejects fictional packing evidence", () => {
  const result = assessPackingProfileActivation({
    profile,
    evidence: claimedEvidence
  });

  assert.equal(result.eligibleForFurtherReview, false);
  assert.equal(result.eligibilityReason, "PLACEHOLDER_EVIDENCE_REJECTED");
  assert.equal(result.mayActivateProfile, false);
});

test("identifies missing evidence", () => {
  const result = assessPackingProfileActivation({
    profile,
    evidence: {}
  });

  assert.deepEqual(result.missingEvidence, [
    "PACKAGE_WEIGHT_LIMIT_CHECK",
    "EVIDENCE_REFERENCE",
    "ADMINISTRATOR_APPROVAL"
  ]);
  assert.equal(result.structurallyComplete, false);
});

test("complete-looking evidence remains review-only", () => {
  const result = assessPackingProfileActivation({
    profile: {
      ...profile,
      verifiedBy: "Example reviewer",
      verificationNotes: "Example packing measurements supplied for review."
    },
    evidence: claimedEvidence
  });

  assert.equal(result.structurallyComplete, true);
  assert.equal(result.eligibleForFurtherReview, true);
  assert.equal(result.reviewComplete, false);
  assert.equal(result.mayActivateProfile, false);
  assert.equal(result.mayExecutePayment, false);
});

test("missing profile cannot qualify", () => {
  const result = assessPackingProfileActivation({
    evidence: claimedEvidence
  });

  assert.equal(result.eligibleForFurtherReview, false);
  assert.equal(result.mayActivateProfile, false);
});

test("already active profile cannot qualify again", () => {
  const result = assessPackingProfileActivation({
    profile: {
      ...profile,
      active: true
    },
    evidence: claimedEvidence
  });

  assert.equal(result.eligibilityReason, "PROFILE_ALREADY_ACTIVE");
  assert.equal(result.mayActivateProfile, false);
});
