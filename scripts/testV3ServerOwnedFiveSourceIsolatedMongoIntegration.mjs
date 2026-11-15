import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import Order from "../models/Order.js";

import {
  createV3ServerOwnedLocalEvidenceReaders
} from "../utils/createV3ServerOwnedLocalEvidenceReaders.js";

import {
  createV3ServerOwnedSdkFiveSourceDiagnosticReview
} from "../utils/createV3ServerOwnedSdkFiveSourceDiagnosticReview.js";

import {
  getV3SandboxConnection
} from "../utils/v3SandboxDatabaseConnection.js";

const ORDER_ID = "507f1f77bcf86cd799439011";

function assertLoopback(uri) {
  const parsed = new URL(uri);

  assert.equal(parsed.protocol, "mongodb:");

  assert.ok(
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname),
    "MongoDB test connection must use loopback"
  );
}

test("real isolated MongoDB connections remain diagnostic-only", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox");
  assert.equal(process.env.SMART_SHIPPING_V3_ENABLED, "true");

  // No real Square tokens are allowed in this test process.
  assert.equal(process.env.SQUARE_ACCESS_TOKEN, undefined);
  assert.equal(process.env.SQUARE_SANDBOX_ACCESS_TOKEN, undefined);

  let replica;
  let sandboxConnection;

  const previousUri = process.env.V3_SANDBOX_MONGO_URI;

  try {
    replica = await MongoMemoryReplSet.create({
      replSet: { count: 1 }
    });

    const storeUri = replica.getUri("signavi_store");
    const sandboxUri = replica.getUri("signavi_shipping_v3_dev");

    assertLoopback(storeUri);
    assertLoopback(sandboxUri);

    // Explicitly bind the application factories to disposable DBs.
    process.env.V3_SANDBOX_MONGO_URI = sandboxUri;

    await mongoose.connect(storeUri, {
      serverSelectionTimeoutMS: 5000
    });

    assert.equal(
      mongoose.connection.db.databaseName,
      "signavi_store"
    );

    assert.equal(Order.db, mongoose.connection);

    sandboxConnection = await getV3SandboxConnection();

    assert.equal(
      sandboxConnection.db.databaseName,
      "signavi_shipping_v3_dev"
    );

    assert.notEqual(
      sandboxConnection,
      mongoose.connection
    );

    console.log("PASS: REAL TWO-DATABASE ISOLATION");

    const localReaders =
      await createV3ServerOwnedLocalEvidenceReaders();

    assert.equal(typeof localReaders.readKnownHistory, "function");
    assert.equal(typeof localReaders.readOwnership, "function");
    assert.equal(Object.isFrozen(localReaders), true);

    console.log("PASS: SERVER-OWNED LOCAL READERS CONSTRUCTED");

    const [history, ownership] = await Promise.all([
      localReaders.readKnownHistory({ orderId: ORDER_ID }),
      localReaders.readOwnership({ orderId: ORDER_ID })
    ]);

    assert.ok(history && typeof history === "object");
    assert.ok(ownership && typeof ownership === "object");

    // Empty disposable databases do not confer payment authority.
    for (const evidence of [history, ownership]) {
      assert.notEqual(evidence.squareRequestAuthorized, true);
      assert.notEqual(evidence.retryAuthorized, true);
      assert.notEqual(evidence.authoritativeNoPriorActivity, true);
    }

    console.log("PASS: REAL LOCAL EVIDENCE REMAINS NON-AUTHORIZING");

    // All five readers are configured in the committed service.
    // With Square credentials deliberately absent, construction
    // must fail BEFORE any Square request can be made.
    await assert.rejects(
      createV3ServerOwnedSdkFiveSourceDiagnosticReview(),
      {
        message: "V3_SANDBOX_TOKEN_REQUIRED"
      }
    );

    console.log("PASS: FULL SDK FACTORY FAILS CLOSED WITHOUT TOKEN");
    console.log("PASS: NO SQUARE PAYMENT REQUESTS");
  } finally {
    try {
      if (sandboxConnection) {
        await sandboxConnection.close();
      }

      await mongoose.disconnect();
    } finally {
      if (replica) {
        await replica.stop();
      }

      if (previousUri === undefined) {
        delete process.env.V3_SANDBOX_MONGO_URI;
      } else {
        process.env.V3_SANDBOX_MONGO_URI = previousUri;
      }
    }

    console.log("PASS: ISOLATED TEST DATABASE CLOSED");
  }
});
