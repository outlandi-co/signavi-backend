import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyShippingProfileIndexReadOnly
} from "./verifyShippingProfileIndexReadOnly.mjs";

const expectedIndex = {
  name: "productId_1_packageId_1",
  key: {
    productId: 1,
    packageId: 1
  },
  unique: true
};

function makeModel({
  database = "signavi_studio",
  indexes = [expectedIndex],
  fail = false
} = {}) {
  const db = {
    name: database,
    readyState: 1
  };

  const collection = {
    name: "shippingproductpackageprofiles",
    conn: db,
    listIndexes() {
      if (fail) {
        throw new Error("Synthetic inspection failure");
      }

      return {
        async toArray() {
          return indexes;
        }
      };
    }
  };

  return {
    modelName: "ShippingProductPackageProfile",
    db,
    collection
  };
}

const verify = model =>
  verifyShippingProfileIndexReadOnly({
    model,
    expectedDatabase: "signavi_studio"
  });

test("accepts the exact unique compound index", async () => {
  const result = await verify(makeModel());

  assert.equal(result.verified, true);
  assert.equal(
    result.reason,
    "SHIPPING_PROFILE_UNIQUE_INDEX_PRESENT"
  );
});

test("rejects a missing index", async () => {
  const result = await verify(makeModel({ indexes: [] }));
  assert.equal(result.verified, false);
});

test("rejects an index without uniqueness", async () => {
  const result = await verify(makeModel({
    indexes: [{
      ...expectedIndex,
      unique: false
    }]
  }));

  assert.equal(result.verified, false);
});

test("rejects partial and sparse indexes", async () => {
  for (const override of [
    { sparse: true },
    { partialFilterExpression: { active: true } }
  ]) {
    const result = await verify(makeModel({
      indexes: [{ ...expectedIndex, ...override }]
    }));

    assert.equal(result.verified, false);
  }
});

test("rejects reversed index key order", async () => {
  const result = await verify(makeModel({
    indexes: [{
      key: { packageId: 1, productId: 1 },
      unique: true
    }]
  }));

  assert.equal(result.verified, false);
});

test("rejects a Store model for Studio verification", async () => {
  const result = await verify(makeModel({
    database: "signavi_store"
  }));

  assert.equal(result.verified, false);
  assert.equal(
    result.reason,
    "SHIPPING_PROFILE_MODEL_BINDING_INVALID"
  );
});

test("fails closed on index inspection errors", async () => {
  const result = await verify(makeModel({ fail: true }));

  assert.equal(result.verified, false);
  assert.equal(
    result.reason,
    "SHIPPING_PROFILE_INDEX_INSPECTION_FAILED"
  );
});

test("requires an explicit approved database", async () => {
  const result = await verifyShippingProfileIndexReadOnly({
    model: makeModel()
  });

  assert.equal(result.verified, false);
  assert.equal(result.reason, "INVALID_EXPECTED_DATABASE");
});

test("can independently verify the legacy Store database", async () => {
  const result = await verifyShippingProfileIndexReadOnly({
    model: makeModel({ database: "signavi_store" }),
    expectedDatabase: "signavi_store"
  });

  assert.equal(result.verified, true);
});