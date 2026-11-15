import test, { mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const ORDER_ID = "507f1f77bcf86cd799439011";

let scenario = "order";

const calls = {
  links: 0,
  orders: 0,
  payments: 0,
  creations: 0
};

class FakeSquareClient {
  constructor({ environment } = {}) {
    assert.equal(environment, "sandbox");

    this.checkout = {
      paymentLinks: {
        list: async () => {
          calls.links++;

          return { paymentLinks: [] };
        },
        create: async () => {
          calls.creations++;
          throw new Error("PAYMENT_CREATION_FORBIDDEN");
        }
      }
    };

    this.orders = {
      search: async () => {
        calls.orders++;

        if (scenario === "order") {
          return {
            orders: [{
              id: "square_existing_order",
              state: "OPEN",
              referenceId: `signavi-v3-sandbox-${ORDER_ID}`
            }]
          };
        }

        return { orders: [] };
      },
      get: async () => {
        throw new Error("UNEXPECTED_ORDER_GET");
      },
      create: async () => {
        calls.creations++;
        throw new Error("ORDER_CREATION_FORBIDDEN");
      }
    };

    this.payments = {
      list: async () => {
        calls.payments++;

        if (scenario === "payment") {
          return {
            response: {
              payments: [{
                id: "square_completed_payment",
                status: "COMPLETED",
                referenceId: `ID:${ORDER_ID}`
              }]
            }
          };
        }

        return {
          response: { payments: [] }
        };
      },
      create: async () => {
        calls.creations++;
        throw new Error("PAYMENT_CREATION_FORBIDDEN");
      }
    };
  }
}

function verifyLoopback(uri) {
  const parsed = new URL(uri);

  assert.equal(parsed.protocol, "mongodb:");

  assert.ok(
    ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname),
    "Non-loopback database URI rejected"
  );
}

function assertNonAuthorizing(result) {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);

  assert.equal(
    result.crossSourceReconciliation.squareRequestAuthorized,
    false
  );

  assert.equal(calls.creations, 0);
}

test("full five-source service detects positive Square history", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox");
  assert.equal(process.env.SMART_SHIPPING_V3_ENABLED, "true");

  assert.equal(process.env.SQUARE_ACCESS_TOKEN, undefined);
  assert.equal(process.env.SQUARE_SANDBOX_ACCESS_TOKEN, undefined);

  // Install the SDK mock before importing any Square reader.
  mock.module("square", {
    exports: {
      SquareClient: FakeSquareClient,
      SquareEnvironment: {
        Sandbox: "sandbox",
        Production: "production"
      }
    }
  });

  const sdk = await import("square");
  assert.equal(sdk.SquareClient, FakeSquareClient);

  let replica;
  let sandboxConnection;

  const previousUri = process.env.V3_SANDBOX_MONGO_URI;
  const previousToken = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;

  try {
    replica = await MongoMemoryReplSet.create({
      replSet: { count: 1 }
    });

    const storeUri = replica.getUri("signavi_store");
    const sandboxUri = replica.getUri("signavi_shipping_v3_dev");

    verifyLoopback(storeUri);
    verifyLoopback(sandboxUri);

    process.env.V3_SANDBOX_MONGO_URI = sandboxUri;

    // Synthetic credential only, with the Square module mocked.
    process.env.SQUARE_SANDBOX_ACCESS_TOKEN =
      "synthetic_sdk_mock_only";

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

    const { createV3ServerOwnedSdkFiveSourceDiagnosticReview } =
      await import(
        "../utils/createV3ServerOwnedSdkFiveSourceDiagnosticReview.js"
      );

    const service =
      await createV3ServerOwnedSdkFiveSourceDiagnosticReview();

    assert.equal(typeof service.reviewWithDiagnostics, "function");
    assert.equal(Object.isFrozen(service), true);

    async function runScenario(name) {
      scenario = name;

      const before = { ...calls };
      const result = await service.reviewWithDiagnostics(ORDER_ID);

      assert.equal(calls.links, before.links + 1);
      assert.equal(calls.orders, before.orders + 1);
      assert.equal(calls.payments, before.payments + 1);

      assert.ok(result.fiveSourceDiagnostics);
      assertNonAuthorizing(result);

      return result;
    }

    // Scenario 1: Existing Square order.
    const orderResult = await runScenario("order");

    const orderEvidence = JSON.stringify(
      orderResult.fiveSourceDiagnostics
    );

    assert.equal(
      orderResult.fiveSourceDiagnostics.squareOrders.positiveObserved,
      true,
      "Existing Square order must be positively detected"
    );

    assert.equal(
      orderResult.fiveSourceDiagnostics.squareOrders.observation,
      "PRIOR_ACTIVITY_OBSERVED"
    );

    assert.equal(
      orderResult.diagnostics.observedActivityCount,
      1,
      "Exactly one Square activity source must be detected"
    );

    assert.deepEqual(
      orderResult.crossSourceReconciliation.reportedSquareActivitySources,
      ["squareOrders"],
      "Reconciliation must identify Square Orders as the activity source"
    );

    assert.ok(
      orderResult.crossSourceReconciliation.issues.includes(
        "REPORTED_SQUARE_PRIOR_ACTIVITY"
      ),
      "Reconciliation must report existing Square activity"
    );

    console.log("PASS: EXISTING SQUARE ORDER DETECTED");

    // Scenario 2: Existing completed payment.
    const paymentResult = await runScenario("payment");

    const paymentEvidence = JSON.stringify(
      paymentResult.fiveSourceDiagnostics
    );

    assert.equal(
      paymentResult.fiveSourceDiagnostics.squarePayments.positiveObserved,
      true,
      "Existing Square payment must be positively detected"
    );

    assert.equal(
      paymentResult.fiveSourceDiagnostics.squarePayments.observation,
      "PRIOR_ACTIVITY_OBSERVED"
    );

    assert.equal(
      paymentResult.diagnostics.observedActivityCount,
      1,
      "Exactly one Square activity source must be detected"
    );

    assert.deepEqual(
      paymentResult.crossSourceReconciliation.reportedSquareActivitySources,
      ["squarePayments"],
      "Reconciliation must identify Square Payments as the activity source"
    );

    assert.ok(
      paymentResult.crossSourceReconciliation.issues.includes(
        "REPORTED_SQUARE_PRIOR_ACTIVITY"
      ),
      "Reconciliation must report existing Square activity"
    );

    console.log("PASS: EXISTING SQUARE PAYMENT DETECTED");

    // Scenario 3: Apparently empty SDK responses.
    // Successful-looking emptiness is not authoritative clearance.
    const emptyResult = await runScenario("empty");

    assert.equal(emptyResult.authoritativeNoPriorActivity, false);
    assert.equal(emptyResult.readyForAuthorizationReview, false);
    assertNonAuthorizing(emptyResult);

    console.log("PASS: EMPTY-LOOKING HISTORY IS NON-AUTHORIZING");
    console.log("PASS: ALL THREE SQUARE SOURCES CALLED PER SCENARIO");
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

      if (previousUri === undefined) {
        delete process.env.V3_SANDBOX_MONGO_URI;
      } else {
        process.env.V3_SANDBOX_MONGO_URI = previousUri;
      }

      if (previousToken === undefined) {
        delete process.env.SQUARE_SANDBOX_ACCESS_TOKEN;
      } else {
        process.env.SQUARE_SANDBOX_ACCESS_TOKEN = previousToken;
      }
    }

    console.log("PASS: DISPOSABLE DATABASE CLEANUP");
  }
});
