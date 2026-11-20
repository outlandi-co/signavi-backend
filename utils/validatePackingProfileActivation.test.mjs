import test from "node:test";
import assert from "node:assert/strict";

import {
  validatePackingProfileActivation
} from "./validatePackingProfileActivation.mjs";

const profile = {
  active: false,
  unitWeightOz: 6,
  verifiedCapacity: 4,
  verifiedBy: "DEVELOPMENT_PLACEHOLDER_NOT_PHYSICALLY_VERIFIED",
  verifiedAt: "2026-11-20",
  verificationNotes: "TEST ONLY. Assumed capacity; not physically verified."
};

test("rejects placeholder verification evidence", () => {
  const result = validatePackingProfileActivation({
    profile,
    evidenceReviewed: true,
    administratorApproved: true
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PLACEHOLDER_EVIDENCE_REJECTED");
  assert.equal(result.mayActivate, false);
});

test("rejects missing profile", () => {
  const result = validatePackingProfileActivation({});

  assert.equal(result.reason, "PROFILE_MISSING");
  assert.equal(result.mayActivate, false);
});

test("rejects already active profile", () => {
  const result = validatePackingProfileActivation({
    profile: { ...profile, active: true }
  });

  assert.equal(result.reason, "PROFILE_ALREADY_ACTIVE");
  assert.equal(result.mayActivate, false);
});

test("rejects missing administrator approval", () => {
  const result = validatePackingProfileActivation({
    profile: {
      ...profile,
      verifiedBy: "Authorized packing reviewer",
      verificationNotes: "Physical measurements documented and reviewed."
    },
    evidenceReviewed: true
  });

  assert.equal(result.reason, "ADMINISTRATOR_APPROVAL_REQUIRED");
  assert.equal(result.mayActivate, false);
});

test("eligibility never grants activation permission", () => {
  const result = validatePackingProfileActivation({
    profile: {
      ...profile,
      verifiedBy: "Authorized packing reviewer",
      verificationNotes: "Physical measurements documented and reviewed."
    },
    evidenceReviewed: true,
    administratorApproved: true
  });

  assert.equal(result.eligible, true);
  assert.equal(result.mayActivate, false);
});
