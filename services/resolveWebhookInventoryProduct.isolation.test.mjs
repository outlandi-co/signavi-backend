import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveWebhookInventoryProduct
} from "./resolveWebhookInventoryProduct.js";

const productId = "507f1f77bcf86cd799439011";

function makeModel(databaseName, product = null) {
  const db = {
    name: databaseName,
    readyState: 1
  };

  const calls = [];

  const model = {
    modelName: "Product",
    db,
    collection: {
      name: "products",
      conn: db
    },
    findOne: async (query) => {
      calls.push(query);
      return product;
    }
  };

  return { model, calls };
}

function makeProduct(channel) {
  return {
    _id: productId,
    storefront: channel,
    salesChannel: channel
  };
}

function makeOrder(channel) {
  return {
    storefront: channel,
    salesChannel: channel
  };
}

const item = {
  productId,
  name: "T Shirt"
};

test("Studio webhook resolves Studio inventory", async () => {
  const studio = makeModel(
    "signavi_studio",
    makeProduct("signavi_studio")
  );

  const legacy = makeModel("signavi_store");

  const result = await resolveWebhookInventoryProduct({
    item,
    order: makeOrder("signavi_studio"),
    legacyModel: legacy.model,
    isolatedModelResolver: () => studio.model,
    strict: true,
    isolationEnabled: true
  });

  assert.equal(result.storefront, "signavi_studio");
  assert.equal(studio.calls.length, 1);
  assert.equal(legacy.calls.length, 0);
  assert.equal(studio.calls[0]._id, productId);
});

test("Store webhook resolves Store inventory", async () => {
  const store = makeModel(
    "signavi_store",
    makeProduct("signavi_store")
  );

  const legacy = makeModel("signavi_store");

  const result = await resolveWebhookInventoryProduct({
    item,
    order: makeOrder("signavi_store"),
    legacyModel: legacy.model,
    isolatedModelResolver: () => store.model,
    strict: true,
    isolationEnabled: true
  });

  assert.equal(result.storefront, "signavi_store");
  assert.equal(store.calls.length, 1);
  assert.equal(legacy.calls.length, 0);
});

test("Studio webhook rejects Store model binding", async () => {
  const store = makeModel("signavi_store");
  const legacy = makeModel("signavi_store");

  await assert.rejects(
    resolveWebhookInventoryProduct({
      item,
      order: makeOrder("signavi_studio"),
      legacyModel: legacy.model,
      isolatedModelResolver: () => store.model,
      strict: true,
      isolationEnabled: true
    }),
    /PRODUCT_DATABASE_BINDING_MISMATCH/
  );

  assert.equal(store.calls.length, 0);
});

test("Missing product ID fails closed", async () => {
  const legacy = makeModel("signavi_store");

  await assert.rejects(
    resolveWebhookInventoryProduct({
      item: { name: "T Shirt" },
      order: makeOrder("signavi_studio"),
      legacyModel: legacy.model,
      strict: true,
      isolationEnabled: true
    }),
    /WEBHOOK_INVENTORY_PRODUCT_ID_UNVERIFIED/
  );

  assert.equal(legacy.calls.length, 0);
});

test("Conflicting order channels fail closed", async () => {
  const legacy = makeModel("signavi_store");

  await assert.rejects(
    resolveWebhookInventoryProduct({
      item,
      order: {
        storefront: "signavi_studio",
        salesChannel: "signavi_store"
      },
      legacyModel: legacy.model,
      strict: true,
      isolationEnabled: true
    }),
    /WEBHOOK_INVENTORY_CHANNEL_CONFLICT/
  );
});

test("Wrong-store product response is rejected", async () => {
  const studio = makeModel(
    "signavi_studio",
    makeProduct("signavi_store")
  );

  const legacy = makeModel("signavi_store");

  await assert.rejects(
    resolveWebhookInventoryProduct({
      item,
      order: makeOrder("signavi_studio"),
      legacyModel: legacy.model,
      isolatedModelResolver: () => studio.model,
      strict: true,
      isolationEnabled: true
    }),
    /WEBHOOK_INVENTORY_PRODUCT_OWNERSHIP_MISMATCH/
  );
});

test("Legacy mode behavior remains unchanged", async () => {
  const legacy = makeModel(
    "signavi_store",
    makeProduct("signavi_studio")
  );

  const result = await resolveWebhookInventoryProduct({
    item,
    order: makeOrder("signavi_studio"),
    legacyModel: legacy.model,
    strict: false,
    isolationEnabled: false
  });

  assert.equal(result._id, productId);
  assert.deepEqual(legacy.calls[0], {
    name: "T Shirt"
  });
});
