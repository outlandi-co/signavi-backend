
import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3LocalSharedSandboxConnection
} from "../utils/createV3LocalSharedSandboxConnection.js";

const keys = [
  "NODE_ENV",
  "SQUARE_ENVIRONMENT",
  "SMART_SHIPPING_V3_ENABLED"
];

const previous = Object.fromEntries(
  keys.map(key => [key, process.env[key]])
);

test.before(() => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
  process.env.SMART_SHIPPING_V3_ENABLED = "true";
});

test.after(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

function fixture() {
  const client = { db() {}, startSession() {} };

  const storefront = {
    readyState: 1,
    host: "127.0.0.1",
    port: 27028,
    db: { databaseName: "signavi_store" },
    getClient: () => client
  };

  const sandbox = {
    readyState: 1,
    host: "127.0.0.1",
    port: 27028,
    db: { databaseName: "signavi_shipping_v3_dev" },
    getClient: () => client
  };

  storefront.useDb = (name, options) => {
    assert.equal(name, "signavi_shipping_v3_dev");
    assert.equal(options.useCache, true);
    return sandbox;
  };

  return { storefront, sandbox };
}

test("local shared client prepares connection without authorization", () => {
  const { storefront, sandbox } = fixture();

  const result = createV3LocalSharedSandboxConnection({
    storefrontConnection: storefront
  });

  assert.equal(result.sharedClientVerified, true);
  assert.equal(result.sandboxConnection, sandbox);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("hosted MongoDB is rejected before useDb", () => {
  const { storefront } = fixture();
  let called = false;

  storefront.host = "cluster.mongodb.net";
  storefront.useDb = () => {
    called = true;
    throw new Error("Must not run");
  };

  assert.throws(
    () => createV3LocalSharedSandboxConnection({
      storefrontConnection: storefront
    }),
    /V3_LOCAL_TEST_STOREFRONT_REQUIRED/
  );

  assert.equal(called, false);
});

test("default local MongoDB port is rejected", () => {
  const { storefront } = fixture();
  storefront.port = 27017;

  assert.throws(
    () => createV3LocalSharedSandboxConnection({
      storefrontConnection: storefront
    }),
    /V3_LOCAL_TEST_STOREFRONT_REQUIRED/
  );
});

test("incorrect storefront database is rejected", () => {
  const { storefront } = fixture();
  storefront.db.databaseName = "signavi_production";

  assert.throws(
    () => createV3LocalSharedSandboxConnection({
      storefrontConnection: storefront
    }),
    /V3_LOCAL_TEST_STOREFRONT_REQUIRED/
  );
});

test("separate sandbox MongoDB client is rejected", () => {
  const { storefront, sandbox } = fixture();

  sandbox.getClient = () => ({
    db() {},
    startSession() {}
  });

  assert.throws(
    () => createV3LocalSharedSandboxConnection({
      storefrontConnection: storefront
    }),
    /V3_SHARED_TRANSACTION_TOPOLOGY_REJECTED/
  );
});

test("disabled feature rejects connection factory", () => {
  const { storefront } = fixture();
  process.env.SMART_SHIPPING_V3_ENABLED = "false";

  try {
    assert.throws(
      () => createV3LocalSharedSandboxConnection({
        storefrontConnection: storefront
      }),
      /V3_SHARED_CONNECTION_TEST_ONLY/
    );
  } finally {
    process.env.SMART_SHIPPING_V3_ENABLED = "true";
  }
});

test("development mode rejects test-only factory", () => {
  const { storefront } = fixture();
  process.env.NODE_ENV = "development";

  try {
    assert.throws(
      () => createV3LocalSharedSandboxConnection({
        storefrontConnection: storefront
      }),
      /V3_SHARED_CONNECTION_TEST_ONLY/
    );
  } finally {
    process.env.NODE_ENV = "test";
  }
});
