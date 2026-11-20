import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVerifiedSavedPackageParcels
} from "./buildVerifiedSavedPackageParcels.mjs";

import {
  developmentPackingProfile as fixture
} from "./developmentPackingProfile.mjs";

const packageRecord = {
  id: fixture.packageId,
  length: fixture.packageDimensions.lengthIn,
  width: fixture.packageDimensions.widthIn,
  height: fixture.packageDimensions.heightIn,
  tare: fixture.tareWeightOz,
  maxWeight: fixture.maxWeightOz,
  uspsFlatRate: false
};

function build(quantity, profiles) {
  return buildVerifiedSavedPackageParcels({
    productId: fixture.productId,
    selectedPackageId: fixture.packageId,
    quantity,
    packages: [packageRecord],
    profiles
  });
}

test("inactive development profile is rejected", () => {
  const result = build(1, [fixture]);

  assert.equal(
    result.error,
    "A unique active verified packing profile is required."
  );

  assert.deepEqual(result.parcels, []);
});

test("missing packing profile is rejected", () => {
  const result = build(1, []);

  assert.deepEqual(result.parcels, []);
  assert.ok(result.error);
});

// Synthetic records exist only inside this test process.
// They are NOT database records or physical verification.
const simulatedProfile = {
  productId: fixture.productId,
  packageId: fixture.packageId,
  unitWeightOz: fixture.unitWeightOz,
  verifiedCapacity: fixture.verifiedCapacity,
  verifiedBy: "SYNTHETIC_TEST_REVIEWER",
  verifiedAt: new Date("2026-01-01T00:00:00Z"),
  verificationNotes: "Synthetic contract test only; not physically verified.",
  active: true
};

test("synthetic parcel formatting matches expected output", () => {
  const cases = [
    { quantity: 1, weights: ["7"] },
    { quantity: 4, weights: ["25"] },
    { quantity: 5, weights: ["25", "7"] },
    { quantity: 8, weights: ["25", "25"] },
    { quantity: 9, weights: ["25", "25", "7"] }
  ];

  for (const scenario of cases) {
    const result = build(scenario.quantity, [simulatedProfile]);

    assert.equal(result.error, undefined);
    assert.equal(result.parcels.length, scenario.weights.length);
    assert.deepEqual(
      result.parcels.map(parcel => parcel.weight),
      scenario.weights
    );

    for (const parcel of result.parcels) {
      assert.equal(parcel.length, "14");
      assert.equal(parcel.width, "10");
      assert.equal(parcel.height, "2");
      assert.equal(parcel.distance_unit, "in");
      assert.equal(parcel.mass_unit, "oz");
    }
  }
});

test("more than ten parcels is rejected", () => {
  const result = build(41, [simulatedProfile]);

  assert.equal(
    result.error,
    "Order requires more than 10 shipping parcels."
  );
  assert.deepEqual(result.parcels, []);
});

test("development fixture remains inactive", () => {
  assert.equal(fixture.active, false);
  assert.equal(fixture.testOnly, true);
  assert.equal(fixture.physicallyVerified, false);
});
