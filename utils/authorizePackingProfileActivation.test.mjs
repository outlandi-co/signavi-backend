import test from "node:test";
import assert from "node:assert/strict";

import {
  authorizePackingProfileActivation
} from "./authorizePackingProfileActivation.mjs";

const profile = {
  active: false,
  unitWeightOz: 7,
  verifiedCapacity: 3,
  verifiedBy: "Measurement reviewer",
  verifiedAt: new Date("2026-11-01T12:00:00Z"),
  verificationNotes: "Physical measurements documented"
};

const evidenceReview = {
  completed: true,
  reviewerId: "reviewer-1",
  physicalMeasurementsConfirmed: true
};

const administratorApproval = {
  approved: true,
  administratorId: "administrator-2"
};

function evaluate(overrides = {}) {
  return authorizePackingProfileActivation({
    profile,
    evidenceReview,
    administratorApproval,
    ...overrides
  });
}

test("rejects missing profile", () => {
  const result = evaluate({ profile: null });

  assert.equal(result.authorized, false);
  assert.equal(result.reason, "PROFILE_MISSING");
});

test("rejects placeholder measurements", () => {
  const result = evaluate({
    profile: {
      ...profile,
      verificationNotes: "Assumed placeholder weight"
    }
  });

  assert.equal(result.authorized, false);
  assert.equal(result.reason, "PLACEHOLDER_EVIDENCE_REJECTED");
});

test("rejects incomplete evidence review", () => {
  const result = evaluate({
    evidenceReview: {
      ...evidenceReview,
      physicalMeasurementsConfirmed: false
    }
  });

  assert.equal(result.authorized, false);
  assert.equal(result.reason, "EVIDENCE_REVIEW_REQUIRED");
});

test("rejects missing administrator approval", () => {
  const result = evaluate({
    administratorApproval: {
      ...administratorApproval,
      approved: false
    }
  });

  assert.equal(result.authorized, false);
  assert.equal(result.reason, "ADMINISTRATOR_APPROVAL_REQUIRED");
});

test("rejects same reviewer and administrator", () => {
  const result = evaluate({
    administratorApproval: {
      approved: true,
      administratorId: "reviewer-1"
    }
  });

  assert.equal(result.authorized, false);
  assert.equal(result.reason, "INDEPENDENT_REVIEW_REQUIRED");
});

test("accepts structurally complete synthetic review data", () => {
  const result = evaluate();

  assert.equal(result.authorized, true);
  assert.equal(
    result.reason,
    "ACTIVATION_DECISION_GUARD_PASSED"
  );
});
