import test from "node:test";
import assert from "node:assert/strict";

import {
  planShippingProfileMigration
} from "./planShippingProfileMigration.mjs";

import {
  planShippingProfileProvisioningReview
} from "./planShippingProfileProvisioningReview.mjs";

function connectionFixture({
  database = "signavi_store",
  exists = true,
  indexes = [],
  failInspection = false
} = {}) {
  const connection = {
    name: database,
    readyState: 1
  };

  connection.db = {
    listCollections: () => ({
      toArray: async () => exists
        ? [{ name: "shippingproductpackageprofiles" }]
        : []
    })
  };

  const model = {
    modelName: "ShippingProductPackageProfile",
    db: connection,
    collection: {
      name: "shippingproductpackageprofiles",
      conn: connection,
      listIndexes: () => ({
        toArray: async () => {
          if (failInspection) {
            throw new Error("Synthetic index inspection failure");
          }
          return indexes;
        }
      })
    }
  };

  connection.model = name => {
    if (name !== "ShippingProductPackageProfile") {
      throw new Error("Unexpected model");
    }
    return model;
  };

  return connection;
}

async function inspectAndReview({
  connection,
  database = "signavi_store",
  duplicateCount
}) {
  const preflight = await planShippingProfileMigration({
    connection,
    expectedDatabase: database
  });

  const review = planShippingProfileProvisioningReview({
    expectedDatabase: database,
    preflight,
    duplicateCount
  });

  return { preflight, review };
}

const uniqueIndex = [{
  name: "productId_1_packageId_1",
  key: { productId: 1, packageId: 1 },
  unique: true
}];

test("missing collection produces review-only migration", async () => {
  const { preflight, review } = await inspectAndReview({
    connection: connectionFixture({ exists: false })
  });

  assert.equal(preflight.reason, "PROFILE_COLLECTION_MISSING");
  assert.equal(review.reason, "COLLECTION_CREATION_REVIEW_REQUIRED");
  assert.equal(review.action, "review");
  assert.equal(review.mayCreateCollection, false);
});

test("missing index requires duplicate audit", async () => {
  const { preflight, review } = await inspectAndReview({
    connection: connectionFixture()
  });

  assert.equal(
    preflight.reason,
    "SHIPPING_PROFILE_UNIQUE_INDEX_MISSING"
  );

  assert.equal(review.reason, "DUPLICATE_AUDIT_REQUIRED");
  assert.equal(review.action, "stop");
});

test("zero duplicate pairs permits index review only", async () => {
  const { review } = await inspectAndReview({
    connection: connectionFixture(),
    duplicateCount: 0
  });

  assert.equal(review.reason, "UNIQUE_INDEX_REVIEW_REQUIRED");
  assert.equal(review.action, "review");
  assert.equal(review.mayCreateIndex, false);
});

test("duplicate pairs block migration", async () => {
  const { review } = await inspectAndReview({
    connection: connectionFixture(),
    duplicateCount: 2
  });

  assert.equal(review.reason, "DUPLICATE_PROFILE_PAIRS_FOUND");
  assert.equal(review.action, "stop");
});

test("valid unique index requires no migration", async () => {
  const { preflight, review } = await inspectAndReview({
    connection: connectionFixture({ indexes: uniqueIndex })
  });

  assert.equal(preflight.ready, true);
  assert.equal(review.reason, "INDEX_ALREADY_VERIFIED");
  assert.equal(review.action, "none");
});

test("index inspection errors fail closed", async () => {
  const { preflight, review } = await inspectAndReview({
    connection: connectionFixture({ failInspection: true })
  });

  assert.equal(
    preflight.reason,
    "SHIPPING_PROFILE_INDEX_INSPECTION_FAILED"
  );

  assert.equal(review.action, "stop");
});

test("wrong database cannot produce migration approval", async () => {
  const { preflight, review } = await inspectAndReview({
    connection: connectionFixture({ database: "signavi_studio" })
  });

  assert.equal(preflight.reason, "DATABASE_BINDING_INVALID");
  assert.equal(review.action, "stop");
});

test("every integrated scenario forbids writes", async () => {
  const scenarios = [
    { exists: false },
    { indexes: [] },
    { indexes: uniqueIndex },
    { failInspection: true }
  ];

  for (const options of scenarios) {
    const { preflight, review } = await inspectAndReview({
      connection: connectionFixture(options)
    });

    assert.equal(preflight.writesAuthorized, false);
    assert.equal(review.mayCreateCollection, false);
    assert.equal(review.mayCreateIndex, false);
    assert.equal(review.mayCreateProfile, false);
    assert.equal(review.mayActivateProfile, false);
    assert.equal(review.mayExecutePayment, false);
  }
});