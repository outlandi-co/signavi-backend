import test from "node:test";
import assert from "node:assert/strict";
import {
  preparePackingProfileDraft
} from "./preparePackingProfileDraft.mjs";

const productId = "507f1f77bcf86cd799439011";
const packageId = "507f1f77bcf86cd799439012";

const input = {
  productId,
  packageId,
  unitWeightOz: 7,
  verifiedCapacity: 3,
  verifiedBy: "Test verifier",
  verifiedAt: "2026-11-01T12:00:00Z",
  verificationNotes: "Synthetic test evidence only"
};

const product = {
  _id: productId,
  storefront: "signavi_studio",
  salesChannel: "signavi_studio",
  productType: "physical",
  shipping: {
    mode: "saved_package",
    packageId,
    packagingType: "mailer"
  }
};

const shippingPackage = {
  _id: packageId,
  active: true,
  type: "mailer",
  lengthIn: 14,
  widthIn: 10,
  heightIn: 2,
  tareWeightOz: 1,
  maxWeightOz: 32,
  uspsFlatRate: false
};

function prepare(changes = {}) {
  return preparePackingProfileDraft({
    input: { ...input, ...(changes.input || {}) },
    product: { ...product, ...(changes.product || {}) },
    shippingPackage: {
      ...shippingPackage,
      ...(changes.shippingPackage || {})
    }
  });
}

test("prepares a valid inactive draft", () => {
  const result = prepare();
  assert.equal(result.valid, true);
  assert.equal(result.data.active, false);
});

test("rejects unmatched product identifiers", () => {
  const result = prepare({
    input: {
      productId: "507f1f77bcf86cd799439099"
    }
  });
  assert.equal(result.valid, false);
});

test("rejects unmatched package identifiers", () => {
  const result = prepare({
    input: {
      packageId: "507f1f77bcf86cd799439099"
    }
  });
  assert.equal(result.valid, false);
});

test("rejects overweight packing capacity", () => {
  const result = prepare({
    input: { verifiedCapacity: 5 }
  });
  assert.equal(result.valid, false);
});

test("rejects invalid verification evidence", () => {
  const result = prepare({
    input: { verificationNotes: "" }
  });
  assert.equal(result.valid, false);
});

test("rejects Store ownership", () => {
  const result = prepare({
    product: {
      storefront: "signavi_store",
      salesChannel: "signavi_store"
    }
  });
  assert.equal(result.valid, false);
});
