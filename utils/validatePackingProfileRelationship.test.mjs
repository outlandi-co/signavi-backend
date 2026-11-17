import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePackingProfileRelationship
} from "./validatePackingProfileRelationship.mjs";

const productId = "507f1f77bcf86cd799439011";
const packageId = "507f1f77bcf86cd799439012";

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

function check(changes = {}) {
  return validatePackingProfileRelationship({
    product: {
      ...product,
      ...(changes.product || {})
    },
    shippingPackage: {
      ...shippingPackage,
      ...(changes.shippingPackage || {})
    }
  });
}

test("accepts matching Studio product and package", () => {
  const result = check();
  assert.equal(result.valid, true);
  assert.equal(result.storefront, "signavi_studio");
});

test("rejects Store product", () => {
  const result = check({
    product: {
      storefront: "signavi_store",
      salesChannel: "signavi_store"
    }
  });
  assert.equal(result.valid, false);
});

test("rejects mismatched sales channel", () => {
  const result = check({
    product: { salesChannel: "signavi_store" }
  });
  assert.equal(result.valid, false);
});

test("rejects digital product", () => {
  const result = check({
    product: { productType: "digital" }
  });
  assert.equal(result.valid, false);
});

test("rejects wrong shipping mode", () => {
  const result = check({
    product: {
      shipping: {
        ...product.shipping,
        mode: "product_measurements"
      }
    }
  });
  assert.equal(result.valid, false);
});

test("rejects different package ID", () => {
  const result = check({
    shippingPackage: {
      _id: "507f1f77bcf86cd799439099"
    }
  });
  assert.equal(result.valid, false);
});

test("rejects inactive package", () => {
  const result = check({
    shippingPackage: { active: false }
  });
  assert.equal(result.valid, false);
});

test("rejects package type mismatch", () => {
  const result = check({
    shippingPackage: { type: "box" }
  });
  assert.equal(result.valid, false);
});

test("rejects invalid dimensions", () => {
  const result = check({
    shippingPackage: { lengthIn: 0 }
  });
  assert.equal(result.valid, false);
});

test("rejects invalid weight limits", () => {
  const result = check({
    shippingPackage: {
      tareWeightOz: 32,
      maxWeightOz: 32
    }
  });
  assert.equal(result.valid, false);
});

test("rejects unapproved USPS Flat Rate", () => {
  const result = check({
    shippingPackage: { uspsFlatRate: true }
  });
  assert.equal(result.valid, false);
});

test("rejects missing product or package", () => {
  assert.equal(
    validatePackingProfileRelationship({
      product: null,
      shippingPackage
    }).valid,
    false
  );

  assert.equal(
    validatePackingProfileRelationship({
      product,
      shippingPackage: null
    }).valid,
    false
  );
});
