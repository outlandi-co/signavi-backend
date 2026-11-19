import test from "node:test";
import assert from "node:assert/strict";

import {
  planShippingProfileMigration
} from "./planShippingProfileMigration.mjs";

function makeConnection({
  database = "signavi_store",
  collectionExists = true,
  indexes = [{
    key: { productId: 1, packageId: 1 },
    unique: true
  }]
} = {}) {
  const connection = {
    name: database,
    readyState: 1
  };

  const model = {
    modelName: "ShippingProductPackageProfile",
    db: connection,
    collection: {
      name: "shippingproductpackageprofiles",
      conn: connection,
      listIndexes: () => ({
        toArray: async () => indexes
      })
    }
  };

  connection.db = {
    listCollections: () => ({
      toArray: async () =>
        collectionExists
          ? [{ name: "shippingproductpackageprofiles" }]
          : []
    })
  };

  connection.model = () => model;

  return connection;
}

const run = connection =>
  planShippingProfileMigration({
    connection,
    expectedDatabase: "signavi_store"
  });

test("missing collection requires migration review", async () => {
  const result = await run(makeConnection({
    collectionExists: false
  }));

  assert.equal(result.ready, false);
  assert.equal(result.reason, "PROFILE_COLLECTION_MISSING");
  assert.equal(result.writesAuthorized, false);
});

test("missing unique index requires review", async () => {
  const result = await run(makeConnection({
    indexes: []
  }));

  assert.equal(result.ready, false);
  assert.equal(result.nextAction, "REVIEW_UNIQUE_INDEX_MIGRATION");
});

test("correct collection and index pass preflight", async () => {
  const result = await run(makeConnection());

  assert.equal(result.ready, true);
  assert.equal(result.writesAuthorized, false);
});

test("Studio binding cannot substitute for Store", async () => {
  const result = await run(makeConnection({
    database: "signavi_studio"
  }));

  assert.equal(result.ready, false);
  assert.equal(result.reason, "DATABASE_BINDING_INVALID");
});

test("invalid database is rejected", async () => {
  const result = await planShippingProfileMigration({
    connection: makeConnection(),
    expectedDatabase: "unknown"
  });

  assert.equal(result.ready, false);
});