import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex");

const {
  buildVerifiedSavedPackageParcels
} = await import("./buildVerifiedSavedPackageParcels.mjs");

const {
  developmentPackingProfile: fixture
} = await import("./developmentPackingProfile.mjs");

const {
  combineParcelRates
} = await import("../routes/shipping.js");

const {
  createMultiParcelShippingQuote,
  verifyShippingQuote
} = await import("./shippingQuote.js");

const selectedPackage = {
  id: fixture.packageId,
  length: fixture.packageDimensions.lengthIn,
  width: fixture.packageDimensions.widthIn,
  height: fixture.packageDimensions.heightIn,
  tare: fixture.tareWeightOz,
  maxWeight: fixture.maxWeightOz,
  uspsFlatRate: false
};

// Synthetic test-only profile. Never persist to MongoDB.
const simulatedProfile = {
  ...fixture,
  active: true,
  verifiedBy: "SYNTHETIC_TEST_ONLY",
  verifiedAt: new Date("2026-01-01T00:00:00Z"),
  verificationNotes: "Synthetic pipeline test, not physical verification."
};

const destination = {
  street1: "123 Test Street",
  city: "Example City",
  state: "CA",
  zip: "90000",
  country: "US"
};

function makeParcels(quantity, profile) {
  return buildVerifiedSavedPackageParcels({
    productId: fixture.productId,
    selectedPackageId: fixture.packageId,
    quantity,
    packages: [selectedPackage],
    profiles: [profile]
  });
}

function mockShipments(parcels) {
  return parcels.map((parcel, index) => ({
    rates: [{
      object_id: `synthetic-rate-${index + 1}`,
      amount: (5 + index).toFixed(2),
      currency: "USD",
      provider: "USPS",
      carrier_account: "synthetic-carrier-account",
      servicelevel: {
        token: "usps_priority",
        name: "Priority Mail"
      }
    }]
  }));
}

test("inactive production-style profile fails closed", () => {
  const result = makeParcels(5, fixture);

  assert.equal(
    result.error,
    "A unique active verified packing profile is required."
  );

  assert.deepEqual(result.parcels, []);
  assert.equal(fixture.active, false);
});

test("five synthetic shirts complete shipping pipeline", () => {
  const items = [{
    productId: fixture.productId,
    quantity: 5
  }];

  const packed = makeParcels(5, simulatedProfile);

  assert.equal(packed.error, undefined);
  assert.deepEqual(
    packed.parcels.map(parcel => parcel.weight),
    ["25", "7"]
  );

  // Mock responses; no carrier API calls.
  const shipments = mockShipments(packed.parcels);
  const combined = combineParcelRates(shipments);

  assert.equal(combined.length, 1);
  assert.equal(combined[0].amount, "11.00");

  const quote = createMultiParcelShippingQuote({
    items,
    destination,
    rates: combined[0].parcelRates,
    testMode: true
  });

  const verified = verifyShippingQuote(quote, {
    items,
    destination,
    allowTest: true
  });

  assert.equal(verified.amountCents, 1100);
  assert.equal(verified.testMode, true);
  assert.deepEqual(verified.rateIds, [
    "synthetic-rate-1",
    "synthetic-rate-2"
  ]);
});

test("nine synthetic shirts retain all three rates", () => {
  const items = [{
    productId: fixture.productId,
    quantity: 9
  }];

  const packed = makeParcels(9, simulatedProfile);

  assert.deepEqual(
    packed.parcels.map(parcel => parcel.weight),
    ["25", "25", "7"]
  );

  const combined = combineParcelRates(
    mockShipments(packed.parcels)
  );

  assert.equal(combined[0].amount, "18.00");

  const quote = createMultiParcelShippingQuote({
    items,
    destination,
    rates: combined[0].parcelRates,
    testMode: true
  });

  const verified = verifyShippingQuote(quote, {
    items,
    destination,
    allowTest: true
  });

  assert.equal(verified.amountCents, 1800);
  assert.equal(verified.rateIds.length, 3);
});

test("missing parcel rate prevents a combined quote", () => {
  const packed = makeParcels(5, simulatedProfile);
  const shipments = mockShipments(packed.parcels);

  shipments[1].rates = [];

  const combined = combineParcelRates(shipments);

  assert.deepEqual(combined, []);
});

test("synthetic quote cannot authorize live payment", () => {
  const items = [{
    productId: fixture.productId,
    quantity: 5
  }];

  const packed = makeParcels(5, simulatedProfile);
  const combined = combineParcelRates(
    mockShipments(packed.parcels)
  );

  const quote = createMultiParcelShippingQuote({
    items,
    destination,
    rates: combined[0].parcelRates,
    testMode: true
  });

  assert.throws(() =>
    verifyShippingQuote(quote, {
      items,
      destination,
      allowTest: false
    }),
    /Test shipping rates cannot be used/
  );
});
