import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveProductCatalogModel
} from "./resolveProductCatalogModel.js";

function makeModel(databaseName) {
  const db = {
    name: databaseName,
    readyState: 1
  };

  return {
    modelName: "Product",
    db,
    collection: {
      name: "products",
      conn: db
    }
  };
}

const studio = makeModel("signavi_studio");
const store = makeModel("signavi_store");

test("Studio resolves only the Studio database", () => {
  const resolved = resolveProductCatalogModel("signavi_studio", {
    enabled: true,
    isolatedModelResolver: () => studio
  });

  assert.equal(resolved, studio);
});

test("Store resolves only the Store database", () => {
  const resolved = resolveProductCatalogModel("signavi_store", {
    enabled: true,
    isolatedModelResolver: () => store
  });

  assert.equal(resolved, store);
});

test("Studio rejects a Store database model", () => {
  assert.throws(
    () => resolveProductCatalogModel("signavi_studio", {
      enabled: true,
      isolatedModelResolver: () => store
    }),
    /PRODUCT_DATABASE_BINDING_MISMATCH/
  );
});

test("Store rejects a Studio database model", () => {
  assert.throws(
    () => resolveProductCatalogModel("signavi_store", {
      enabled: true,
      isolatedModelResolver: () => studio
    }),
    /PRODUCT_DATABASE_BINDING_MISMATCH/
  );
});

test("Isolation rejects a missing model resolver", () => {
  assert.throws(
    () => resolveProductCatalogModel("signavi_studio", {
      enabled: true
    }),
    /ISOLATED_PRODUCT_MODEL_RESOLVER_UNAVAILABLE/
  );
});

test("Isolation rejects an incorrect collection binding", () => {
  const incorrect = makeModel("signavi_studio");

  incorrect.collection.name = "store_products";

  assert.throws(
    () => resolveProductCatalogModel("signavi_studio", {
      enabled: true,
      isolatedModelResolver: () => incorrect
    }),
    /PRODUCT_DATABASE_BINDING_MISMATCH/
  );
});

test("Legacy mode preserves the existing model", () => {
  const legacy = makeModel("signavi_store");

  const resolved = resolveProductCatalogModel("signavi_studio", {
    enabled: false,
    legacyModel: legacy
  });

  assert.equal(resolved, legacy);
});

test("Unknown storefronts are rejected", () => {
  assert.throws(
    () => resolveProductCatalogModel("unknown_store", {
      enabled: true,
      isolatedModelResolver: () => studio
    }),
    /INVALID_PRODUCT_CHANNEL/
  );
});
