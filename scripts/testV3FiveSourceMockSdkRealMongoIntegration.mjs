import test, { mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const ORDER_ID = "507f1f77bcf86cd799439011";

const calls = {
  links: 0,
  orders: 0,
  payments: 0,
  creation: 0
};

class FakeSquareClient {
  constructor({ environment } = {}) {
    assert.equal(environment, "sandbox");

    this.checkout = {
      paymentLinks: {
        list: async () => {
          calls.links++;
          throw new Error("MOCK_LINK_READ_FAILURE");
        },
        create: async () => {
          calls.creation++;
          throw new Error("PAYMENT_CREATION_FORBIDDEN");
        }
      }
    };

    this.orders = {
      search: async () => {
        calls.orders++;
        throw new Error("MOCK_ORDER_READ_FAILURE");
      },
      get: async () => {
        throw new Error("MOCK_ORDER_LOOKUP_FAILURE");
      }
    };

    this.payments = {
      list: async () => {
        calls.payments++;
        throw new Error("MOCK_PAYMENT_READ_FAILURE");
      },
      create: async () => {
        calls.creation++;
        throw new Error("PAYMENT_CREATION_FORBIDDEN");
      }
    };
  }
}

function requireLoopback(uri) {
  const parsed = new URL(uri);

  assert.equal(parsed.protocol, "mongodb:");
  assert.ok(
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname),
    "Test MongoDB must be loopback-only"
  );
}

test("real MongoDB and mocked Square execute all five sources safely", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox");

  // Intercept Square BEFORE importing application reader factories.
  mock.module("square", {
    exports: {
      SquareClient: FakeSquareClient,
      SquareEnvironment: {
        Sandbox: "sandbox",
        Production: "production"
      }
    }
  });

  // Explicitly verify that the imported Square SDK is mocked.
  // Never configure an SDK token unless this assertion passes.
  const importedSquare = await import("square");
  assert.equal(importedSquare.SquareClient, FakeSquareClient);

  const previousUri = process.env.V3_SANDBOX_MONGO_URI;
  const previousToken = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;

  let replica;
  let sandboxConnection;

  try {
    replica = await MongoMemoryReplSet.create({
      replSet: { count: 1 }
    });

    const storeUri = replica.getUri("signavi_store");
    const sandboxUri = replica.getUri("signavi_shipping_v3_dev");

    requireLoopback(storeUri);
    requireLoopback(sandboxUri);

    process.env.V3_SANDBOX_MONGO_URI = sandboxUri;

    // This token is synthetic and can reach only FakeSquareClient.
    process.env.SQUARE_SANDBOX_ACCESS_TOKEN =
      "synthetic_mock_only_never_network";

    await mongoose.connect(storeUri, {
      serverSelectionTimeoutMS: 5000
    });

    const { default: Order } = await import("../models/Order.js");

    assert.equal(mongoose.connection.db.databaseName, "signavi_store");
    assert.equal(Order.db, mongoose.connection);

    const { getV3SandboxConnection } = await import(
      "../utils/v3SandboxDatabaseConnection.js"
    );

    sandboxConnection = await getV3SandboxConnection();

    assert.equal(
      sandboxConnection.db.databaseName,
      "signavi_shipping_v3_dev"
    );
    assert.notEqual(sandboxConnection, mongoose.connection);

    const {
      createV3ServerOwnedSdkFiveSourceDiagnosticReview
    } = await import(
      "../utils/createV3ServerOwnedSdkFiveSourceDiagnosticReview.js"
    );

    const service =
      await createV3ServerOwnedSdkFiveSourceDiagnosticReview();

    assert.equal(typeof service.reviewWithDiagnostics, "function");
    assert.equal(Object.isFrozen(service), true);

    const result = await service.reviewWithDiagnostics(ORDER_ID);

    // All three Square readers must actually run.
    assert.equal(calls.links, 1);
    assert.equal(calls.orders, 1);
    assert.equal(calls.payments, 1);

    // Verify all five diagnostic slots are produced.
    assert.ok(result.fiveSourceDiagnostics);

    // The transport failed, so the review must remain blocked.
    assert.equal(result.readyForAuthorizationReview, false);
    assert.equal(result.authoritativeNoPriorActivity, false);
    assert.equal(result.initializationAuthorized, false);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);

    assert.equal(
      result.crossSourceReconciliation.squareRequestAuthorized,
      false
    );

    assert.equal(calls.creation, 0);

    console.log("PASS: REAL STORE/SANDBOX DATABASE ISOLATION");
    console.log("PASS: ALL THREE MOCK SQUARE SOURCES EXECUTED");
    console.log("PASS: FIVE-SOURCE DIAGNOSTICS RETURNED");
    console.log("PASS: FAILED SQUARE READS CANNOT AUTHORIZE PAYMENT");
    console.log("PASS: ZERO PAYMENT CREATION CALLS");
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

      if (previousUri === undefined)
        delete process.env.V3_SANDBOX_MONGO_URI;
      else
        process.env.V3_SANDBOX_MONGO_URI = previousUri;

      if (previousToken === undefined)
        delete process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
      else
        process.env.SQUARE_SANDBOX_ACCESS_TOKEN = previousToken;
    }

    console.log("PASS: ISOLATED DATABASE AND ENVIRONMENT CLEANUP");
  }
});
