import test from "node:test";
import assert from "node:assert/strict";

import {
  reviewPackingProfileEvidence
} from "./reviewPackingProfileEvidence.mjs";

const profile = {
  unitWeightOz: 6,
  verifiedCapacity: 4,
  verifiedBy: "DEVELOPMENT_PLACEHOLDER_NOT_PHYSICALLY_VERIFIED",
  verifiedAt: "2026-11-20",
  verificationNotes: "TEST ONLY. Assumed capacity."
};

test("identifies missing evidence", () => {
  const result = reviewPackingProfileEvidence({
    profile,
    evidence: {}
  });

  assert.deepEqual(result.missing, [
    "PACKAGE_WEIGHT_LIMIT_CHECK",
    "EVIDENCE_REFERENCE",
    "ADMINISTRATOR_APPROVAL"
  ]);

  assert.equal(result.structurallyComplete, false);
  assert.equal(result.mayActivateProfile, false);
});

test("missing profile fails review", () => {
  const result = reviewPackingProfileEvidence({});

  assert.equal(result.structurallyComplete, false);
  assert.equal(result.reviewComplete, false);
});

test("claimed approvals cannot authorize activation", () => {
  const result = reviewPackingProfileEvidence({
    profile,
    evidence: {
      packageWeightChecked: true,
      reference: "UNVERIFIED-TEST-REFERENCE",
      administratorApproved: true
    }
  });

  assert.equal(result.structurallyComplete, true);
  assert.equal(result.reviewComplete, false);
  assert.equal(result.mayActivateProfile, false);
  assert.equal(result.mayExecutePayment, false);
});

test("invalid weight fails structural review", () => {
  const result = reviewPackingProfileEvidence({
    profile: { ...profile, unitWeightOz: -1 },
    evidence: {}
  });

  assert.ok(result.missing.includes("MEASURED_UNIT_WEIGHT"));
  assert.equal(result.mayActivateProfile, false);
});
