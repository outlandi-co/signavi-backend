import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  hasV3ServerOwnedLocalDatabaseBoundary,
  createV3ServerOwnedLocalEvidenceReaders
} from "../utils/createV3ServerOwnedLocalEvidenceReaders.js";

function fixture() {
  const storefrontConnection = {
    readyState: 1,
    db: { databaseName: "signavi_store" }
  };

  const sandboxConnection = {
    readyState: 1,
    db: { databaseName: "signavi_shipping_v3_dev" }
  };

  return {
    storefrontConnection,
    sandboxConnection,
    orderModelConnection: storefrontConnection
  };
}

test("valid Store and sandbox topology passes structural check", () => {
  assert.equal(
    hasV3ServerOwnedLocalDatabaseBoundary(fixture()),
    true
  );
});

test("shared Store and sandbox connection is rejected", () => {
  const input = fixture();
  input.sandboxConnection = input.storefrontConnection;

  assert.equal(
    hasV3ServerOwnedLocalDatabaseBoundary(input),
    false
  );
});

test("wrong Store database is rejected", () => {
  const input = fixture();
  input.storefrontConnection.db.databaseName = "signavi_studio";

  assert.equal(
    hasV3ServerOwnedLocalDatabaseBoundary(input),
    false
  );
});

test("wrong sandbox database is rejected", () => {
  const input = fixture();
  input.sandboxConnection.db.databaseName = "signavi_store";

  assert.equal(
    hasV3ServerOwnedLocalDatabaseBoundary(input),
    false
  );
});

test("disconnected database is rejected", () => {
  const input = fixture();
  input.sandboxConnection.readyState = 0;

  assert.equal(
    hasV3ServerOwnedLocalDatabaseBoundary(input),
    false
  );
});

test("incorrect Order model binding is rejected", () => {
  const input = fixture();
  input.orderModelConnection = {
    readyState: 1,
    db: { databaseName: "signavi_store" }
  };

  assert.equal(
    hasV3ServerOwnedLocalDatabaseBoundary(input),
    false
  );
});

test("missing or malformed database handles fail closed", () => {
  assert.equal(
    hasV3ServerOwnedLocalDatabaseBoundary(),
    false
  );

  assert.equal(
    hasV3ServerOwnedLocalDatabaseBoundary({}),
    false
  );
});

test("server-owned factory accepts no configuration parameters", () => {
  assert.equal(
    createV3ServerOwnedLocalEvidenceReaders.length,
    0
  );
});

test("server-owned composition does not expose execution methods", () => {
  const source = readFileSync(
    new URL(
      "../utils/createV3ServerOwnedLocalEvidenceReaders.js",
      import.meta.url
    ),
    "utf8"
  );

  assert.equal(source.includes("paymentLinks.create"), false);
  assert.equal(source.includes("createPaymentLink("), false);
  assert.equal(source.includes("insertOne("), false);
  assert.equal(source.includes("updateOne("), false);
  assert.equal(source.includes("findOneAndUpdate("), false);
});

test("production environment cannot construct local readers", async () => {
  const originalNode = process.env.NODE_ENV;
  const originalSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "production";
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    await assert.rejects(
      createV3ServerOwnedLocalEvidenceReaders(),
      { message: "V3_SANDBOX_LOCAL_REVIEW_REQUIRED" }
    );
  } finally {
    if (originalNode === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNode;
    }

    if (originalSquare === undefined) {
      delete process.env.SQUARE_ENVIRONMENT;
    } else {
      process.env.SQUARE_ENVIRONMENT = originalSquare;
    }
  }
});
