
import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SharedTransactionTopology
} from "../utils/assessV3SharedTransactionTopology.js";

const client = {
  startSession() {},
  db() {}
};

function fixture({
  sharedClient = true,
  storefrontName = "signavi_store",
  sandboxName = "signavi_shipping_v3_dev"
} = {}) {
  return {
    storefrontConnection: {
      readyState: 1,
      db: { databaseName: storefrontName },
      getClient: () => client
    },
    sandboxConnection: {
      readyState: 1,
      db: { databaseName: sandboxName },
      getClient: () =>
        sharedClient ? client : { startSession() {}, db() {} }
    }
  };
}

function assertNoAuthorization(result) {
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
}

test("shared MongoDB client permits topology assessment only", () => {
  const result = assessV3SharedTransactionTopology(fixture());

  assert.equal(result.compatible, true);
  assertNoAuthorization(result);
});

test("separate MongoDB clients are rejected", () => {
  const result = assessV3SharedTransactionTopology(
    fixture({ sharedClient: false })
  );

  assert.equal(result.compatible, false);
  assert.equal(result.reason, "SEPARATE_MONGODB_CLIENTS");
  assertNoAuthorization(result);
});

test("wrong storefront database is rejected", () => {
  const result = assessV3SharedTransactionTopology(
    fixture({ storefrontName: "production" })
  );

  assert.equal(result.compatible, false);
  assertNoAuthorization(result);
});

test("wrong sandbox database is rejected", () => {
  const result = assessV3SharedTransactionTopology(
    fixture({ sandboxName: "signavi_store" })
  );

  assert.equal(result.compatible, false);
  assertNoAuthorization(result);
});

test("disconnected sandbox is rejected", () => {
  const input = fixture();
  input.sandboxConnection.readyState = 0;

  const result = assessV3SharedTransactionTopology(input);

  assert.equal(result.compatible, false);
  assertNoAuthorization(result);
});

test("identical connection objects are rejected", () => {
  const input = fixture();
  input.sandboxConnection = input.storefrontConnection;

  const result = assessV3SharedTransactionTopology(input);

  assert.equal(result.compatible, false);
  assertNoAuthorization(result);
});

test("missing MongoDB client identity is rejected", () => {
  const input = fixture();
  delete input.sandboxConnection.getClient;

  const result = assessV3SharedTransactionTopology(input);

  assert.equal(result.compatible, false);
  assertNoAuthorization(result);
});

test("client identity failure is rejected", () => {
  const input = fixture();

  input.sandboxConnection.getClient = () => {
    throw new Error("Client unavailable");
  };

  const result = assessV3SharedTransactionTopology(input);

  assert.equal(result.compatible, false);
  assertNoAuthorization(result);
});

test("shared client without session capability is rejected", () => {
  const input = fixture();
  const incomplete = {};

  input.storefrontConnection.getClient = () => incomplete;
  input.sandboxConnection.getClient = () => incomplete;

  const result = assessV3SharedTransactionTopology(input);

  assert.equal(result.compatible, false);
  assertNoAuthorization(result);
});
