import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  collectV3SandboxPersistedPaymentEvidenceReadOnly as collect
} from "../utils/collectV3SandboxPersistedPaymentEvidenceReadOnly.js";

const id = "507f1f77bcf86cd799439011";
const owner = "checkout:server-owner";
const oldNode = process.env.NODE_ENV;
const oldSquare = process.env.SQUARE_ENVIRONMENT;

process.env.NODE_ENV = "test";
process.env.SQUARE_ENVIRONMENT = "sandbox";

const operation = () => ({
  orderId: new mongoose.Types.ObjectId(id),
  environment: "sandbox",
  amountCents: 2500,
  requestOwner: owner,
  idempotencyKey: "server-owned-key",
  checkoutReferenceId: "server-owned-reference",
  status: "reconciliation_required",
  squareCreationAttemptClaimedAt: null,
  squareIdempotencyKey: null,
  squarePaymentLinkId: "",
  squareOrderId: "",
  paymentUrl: ""
});

function setup(readOperation = async () => operation()) {
  const calls = [];

  return {
    calls,
    input: {
      orderId: id,
      expectedAmountCents: 2500,
      expectedOwner: owner,
      sandboxConnection: {
        readyState: 1,
        db: {
          databaseName: "signavi_shipping_v3_dev",
          collection(name) {
            calls.push(["collection", name]);

            return {
              async findOne(query) {
                calls.push(["findOne", query]);
                return readOperation(query);
              }
            };
          }
        }
      }
    }
  };
}

try {
  test("isolated operation can qualify only for review", async () => {
    const { input, calls } = setup();
    const result = await collect(input);

    assert.equal(result.eligibleForTrustedReview, true);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);

    assert.equal(
      calls[0][1],
      "smart_shipping_v3_payment_operations"
    );

    assert.equal(
      String(calls[1][1].orderId),
      id
    );
  });

  test("missing persisted operation is denied", async () => {
    const { input } = setup(async () => null);
    const result = await collect(input);

    assert.equal(result.eligibleForTrustedReview, false);
    assert.equal(result.reason, "PAYMENT_OPERATION_MISSING");
  });

  test("previous Square creation attempt is denied", async () => {
    const { input } = setup(async () => ({
      ...operation(),
      squareCreationAttemptClaimedAt: new Date()
    }));

    const result = await collect(input);

    assert.equal(
      result.reason,
      "PAYMENT_CREATION_ATTEMPT_ALREADY_CLAIMED"
    );
  });

  test("database read failure denies authorization", async () => {
    const { input } = setup(async () => {
      throw new Error("SYNTHETIC_DATABASE_FAILURE");
    });

    const result = await collect(input);

    assert.equal(
      result.reason,
      "PERSISTED_PAYMENT_EVIDENCE_READ_FAILED"
    );
    assert.equal(result.squareRequestAuthorized, false);
  });

  test("wrong database cannot be queried", async () => {
    const { input, calls } = setup();
    input.sandboxConnection.db.databaseName = "signavi_store";

    const result = await collect(input);

    assert.equal(
      result.reason,
      "ISOLATED_SANDBOX_CONNECTION_REQUIRED"
    );
    assert.deepEqual(calls, []);
  });

  test("disconnected sandbox cannot be queried", async () => {
    const { input, calls } = setup();
    input.sandboxConnection.readyState = 0;

    const result = await collect(input);

    assert.equal(
      result.reason,
      "ISOLATED_SANDBOX_CONNECTION_REQUIRED"
    );
    assert.deepEqual(calls, []);
  });

  test("main Mongoose connection cannot substitute for sandbox", async () => {
    const { input } = setup();
    input.sandboxConnection = mongoose.connection;

    const result = await collect(input);

    assert.equal(
      result.reason,
      "ISOLATED_SANDBOX_CONNECTION_REQUIRED"
    );
  });

  test("invalid order is blocked before database read", async () => {
    const { input, calls } = setup();
    input.orderId = "invalid";

    const result = await collect(input);

    assert.equal(result.reason, "INVALID_ORDER_ID");
    assert.deepEqual(calls, []);
  });

  test("caller approval flags cannot grant Square permission", async () => {
    const { input } = setup();

    input.authorized = true;
    input.squareRequestAuthorized = true;

    const result = await collect(input);

    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  });

  test("production mode cannot query this coordinator", async () => {
    const { input, calls } = setup();

    const previous = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";

      const result = await collect(input);

      assert.equal(
        result.reason,
        "SANDBOX_ENVIRONMENT_REQUIRED"
      );

      assert.deepEqual(calls, []);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  test("missing expected owner blocks database access", async () => {
    const { input, calls } = setup();
    input.expectedOwner = "";

    const result = await collect(input);

    assert.equal(
      result.reason,
      "EXPECTED_SERVER_EVIDENCE_MISSING"
    );

    assert.deepEqual(calls, []);
  });
} finally {
  process.env.NODE_ENV = oldNode;
  process.env.SQUARE_ENVIRONMENT = oldSquare;
}
