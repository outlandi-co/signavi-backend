import assert from "node:assert/strict";
import test from "node:test";

import {
  assertShippingModelBinding
} from "./assertShippingModelBinding.js";

function makeModel(channel, name, collection) {
  const db = { name: channel, readyState: 1 };

  return {
    db,
    modelName: name,
    collection: {
      name: collection,
      conn: db
    }
  };
}

test("Studio packing profile model is accepted", () => {
  const model = makeModel(
    "signavi_studio",
    "ShippingProductPackageProfile",
    "shippingproductpackageprofiles"
  );

  assert.equal(
    assertShippingModelBinding(
      model,
      "signavi_studio",
      "ShippingProductPackageProfile"
    ),
    model
  );
});

test("Store packing profile cannot serve Studio", () => {
  const model = makeModel(
    "signavi_store",
    "ShippingProductPackageProfile",
    "shippingproductpackageprofiles"
  );

  assert.throws(
    () => assertShippingModelBinding(
      model,
      "signavi_studio",
      "ShippingProductPackageProfile"
    ),
    /SHIPPING_DATABASE_BINDING_MISMATCH/
  );
});

test("Studio shipping package model is accepted", () => {
  const model = makeModel(
    "signavi_studio",
    "ShippingPackage",
    "shippingpackages"
  );

  assert.equal(
    assertShippingModelBinding(
      model,
      "signavi_studio",
      "ShippingPackage"
    ),
    model
  );
});

test("Wrong shipping collection is rejected", () => {
  const model = makeModel(
    "signavi_studio",
    "ShippingPackage",
    "products"
  );

  assert.throws(
    () => assertShippingModelBinding(
      model,
      "signavi_studio",
      "ShippingPackage"
    ),
    /SHIPPING_DATABASE_BINDING_MISMATCH/
  );
});

test("Disconnected shipping model is rejected", () => {
  const model = makeModel(
    "signavi_studio",
    "ShippingProductPackageProfile",
    "shippingproductpackageprofiles"
  );

  model.db.readyState = 0;

  assert.throws(
    () => assertShippingModelBinding(
      model,
      "signavi_studio",
      "ShippingProductPackageProfile"
    ),
    /SHIPPING_DATABASE_BINDING_MISMATCH/
  );
});

test("Unknown storefront is rejected", () => {
  assert.throws(
    () => assertShippingModelBinding(
      null,
      "unknown",
      "ShippingPackage"
    ),
    /INVALID_SHIPPING_CHANNEL/
  );
});

test("Unknown shipping model is rejected", () => {
  assert.throws(
    () => assertShippingModelBinding(
      null,
      "signavi_store",
      "UnknownModel"
    ),
    /INVALID_SHIPPING_MODEL/
  );
});
