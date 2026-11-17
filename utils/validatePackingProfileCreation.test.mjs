import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePackingProfileCreation
} from "./validatePackingProfileCreation.mjs";

const validInput = {
  productId: "507f1f77bcf86cd799439011",
  packageId: "507f1f77bcf86cd799439012",
  unitWeightOz: 7,
  verifiedCapacity: 3,
  verifiedBy: "Test verifier",
  verifiedAt: "2026-11-01T12:00:00Z",
  verificationNotes: "Synthetic test evidence only"
};

test("accepts complete evidence as inactive", () => {
  const result = validatePackingProfileCreation(validInput);

  assert.equal(result.valid, true);
  assert.equal(result.data.active, false);
  assert.equal(result.data.unitWeightOz, 7);
});

test("rejects missing product ID", () => {
  const result = validatePackingProfileCreation({
    ...validInput,
    productId: ""
  });

  assert.equal(result.valid, false);
});

test("rejects invalid package ID", () => {
  const result = validatePackingProfileCreation({
    ...validInput,
    packageId: "invalid"
  });

  assert.equal(result.valid, false);
});

test("rejects missing measured weight", () => {
  const result = validatePackingProfileCreation({
    ...validInput,
    unitWeightOz: null
  });

  assert.equal(result.valid, false);
});

test("rejects fractional capacity", () => {
  const result = validatePackingProfileCreation({
    ...validInput,
    verifiedCapacity: 1.5
  });

  assert.equal(result.valid, false);
});

test("rejects missing verification notes", () => {
  const result = validatePackingProfileCreation({
    ...validInput,
    verificationNotes: ""
  });

  assert.equal(result.valid, false);
});

test("rejects invalid verification date", () => {
  const result = validatePackingProfileCreation({
    ...validInput,
    verifiedAt: "invalid-date"
  });

  assert.equal(result.valid, false);
});

test("rejects active profile creation", () => {
  const result = validatePackingProfileCreation({
    ...validInput,
    active: true
  });

  assert.equal(result.valid, false);
});

test("rejects invalid request body", () => {
  const result = validatePackingProfileCreation(null);

  assert.equal(result.valid, false);
});

test("ignores unapproved input fields", () => {
  const result = validatePackingProfileCreation({
    ...validInput,
    checkoutEligible: true,
    adminOverride: true
  });

  assert.equal(result.valid, true);
  assert.equal(result.data.checkoutEligible, undefined);
  assert.equal(result.data.adminOverride, undefined);
  assert.equal(result.data.active, false);
});
