import test from "node:test";
import assert from "node:assert/strict";

import {
  diagnoseSavedPackageProfile
} from "./diagnoseSavedPackageProfile.mjs";

const productId = "507f1f77bcf86cd799439011";
const packageId = "507f191e810c19729de860ea";

const box = {
  id: packageId,
  length: 14,
  width: 10,
  height: 2,
  tare: 1,
  maxWeight: 32
};

const profile = {
  productId,
  packageId,
  active: true,
  unitWeightOz: 8,
  verifiedCapacity: 3,
  verifiedBy: "local-test",
  verifiedAt: new Date("2026-01-01T00:00:00Z"),
  verificationNotes: "Synthetic packing verification"
};

function inspect(overrides = {}) {
  return diagnoseSavedPackageProfile({
    productId,
    selectedPackageId: packageId,
    quantity: 2,
    packages: [box],
    profiles: [profile],
    ...overrides
  });
}

function assertSafe(result) {
  assert.equal(result.readOnly, true);
  assert.equal(result.profileMutationAuthorized, false);
  assert.equal(result.shippingBypassAuthorized, false);
  assert.equal(result.paymentAuthorized, false);
}

test("valid verified profile passes local review", () => {
  const result = inspect();
  assert.equal(result.code, "PROFILE_VALID_FOR_REVIEW");
  assert.equal(result.matchingActiveProfiles, 1);
  assertSafe(result);
});

test("missing profile is identified", () => {
  const result = inspect({ profiles: [] });
  assert.equal(result.code, "PROFILE_NOT_FOUND");
  assertSafe(result);
});

test("inactive profile is identified", () => {
  const result = inspect({
    profiles: [{ ...profile, active: false }]
  });
  assert.equal(result.code, "NO_ACTIVE_PROFILE");
  assertSafe(result);
});

test("duplicate active profiles are identified", () => {
  const result = inspect({
    profiles: [{ ...profile }, { ...profile }]
  });
  assert.equal(result.code, "DUPLICATE_ACTIVE_PROFILES");
  assert.equal(result.matchingActiveProfiles, 2);
  assertSafe(result);
});

test("incomplete verification is identified", () => {
  const result = inspect({
    profiles: [{ ...profile, verificationNotes: "" }]
  });
  assert.equal(result.code, "INCOMPLETE_VERIFICATION");
  assertSafe(result);
});

test("profile belonging to another product is not accepted", () => {
  const result = inspect({
    profiles: [{
      ...profile,
      productId: "507f1f77bcf86cd799439012"
    }]
  });
  assert.equal(result.code, "PROFILE_NOT_FOUND");
  assertSafe(result);
});

test("profile belonging to another package is not accepted", () => {
  const result = inspect({
    profiles: [{
      ...profile,
      packageId: "507f191e810c19729de860eb"
    }]
  });
  assert.equal(result.code, "PROFILE_NOT_FOUND");
  assertSafe(result);
});

test("overweight profile remains rejected", () => {
  const result = inspect({
    profiles: [{ ...profile, unitWeightOz: 40 }]
  });
  assert.equal(result.code, "PARCEL_VALIDATION_FAILED");
  assertSafe(result);
});

test("invalid input fails closed", () => {
  const result = inspect({ productId: "invalid" });
  assert.equal(result.code, "INVALID_DIAGNOSTIC_INPUT");
  assertSafe(result);
});
