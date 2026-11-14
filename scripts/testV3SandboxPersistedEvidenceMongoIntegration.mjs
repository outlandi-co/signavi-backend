import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  collectV3SandboxPersistedPaymentEvidenceReadOnly as collect
} from "../utils/collectV3SandboxPersistedPaymentEvidenceReadOnly.js";

const database = "signavi_shipping_v3_dev";
const collectionName = "smart_shipping_v3_payment_operations";

test("real isolated MongoDB persisted evidence", async t => {
  const uri = process.env.MONGO_URI;
  const expectedUri =
    "mongodb://127.0.0.1:27128/" +
    "signavi_shipping_v3_dev?directConnection=true";

  assert.equal(
    uri,
    expectedUri,
    "EXACT_LOCAL_TEST_URI_REQUIRED"
  );

  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox");
  assert.equal(
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED,
    "false"
  );

  const connection = mongoose.createConnection(uri, {
    dbName: database,
    serverSelectionTimeoutMS: 5000
  });

  let inserted = false;
  const orderId = new mongoose.Types.ObjectId();
  const owner = "local-test-evidence-owner";

  try {
    await connection.asPromise();

    assert.equal(connection.readyState, 1);
    assert.equal(connection.db.databaseName, database);
    assert.notEqual(connection, mongoose.connection);

    const hello = await connection.db.admin().command({
      hello: 1
    });

    assert.equal(hello.setName, "signaviV3LocalRs");
    assert.equal(hello.isWritablePrimary, true);

    console.log("LOCAL REPLICA SET VERIFIED");

    const collection = connection.db.collection(
      collectionName
    );

    const document = {
      orderId,
      environment: "sandbox",
      amountCents: 2500,
      requestOwner: owner,
      idempotencyKey: `local-test-${orderId}`,
      checkoutReferenceId: `local-ref-${orderId}`,
      status: "reconciliation_required",
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: null,
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: ""
    };

    const preexisting = await collection.findOne({
      orderId
    });

    assert.equal(
      preexisting,
      null,
      "SYNTHETIC_ORDER_ID_ALREADY_EXISTS"
    );

    await collection.insertOne(document);
    inserted = true;

    const input = {
      orderId: String(orderId),
      expectedAmountCents: 2500,
      expectedOwner: owner,
      sandboxConnection: connection
    };

    await t.test(
      "persisted operation qualifies only for review",
      async () => {
        const result = await collect(input);

        assert.equal(
          result.eligibleForTrustedReview,
          true
        );

        assert.equal(
          result.squareRequestAuthorized,
          false
        );

        assert.equal(result.retryAuthorized, false);
      }
    );

    await t.test(
      "incorrect owner is rejected",
      async () => {
        const result = await collect({
          ...input,
          expectedOwner: "wrong-owner"
        });

        assert.equal(
          result.reason,
          "PAYMENT_OPERATION_OWNER_MISMATCH"
        );
      }
    );

    await t.test(
      "incorrect amount is rejected",
      async () => {
        const result = await collect({
          ...input,
          expectedAmountCents: 2600
        });

        assert.equal(
          result.reason,
          "PAYMENT_OPERATION_AMOUNT_MISMATCH"
        );
      }
    );

    await collection.updateOne(
      { orderId },
      {
        $set: {
          squareCreationAttemptClaimedAt: new Date()
        }
      }
    );

    await t.test(
      "durably claimed payment attempt is rejected",
      async () => {
        const result = await collect(input);

        assert.equal(
          result.reason,
          "PAYMENT_CREATION_ATTEMPT_ALREADY_CLAIMED"
        );
      }
    );

    await collection.updateOne(
      { orderId },
      {
        $set: {
          squareCreationAttemptClaimedAt: null,
          squarePaymentLinkId: "synthetic-existing-link"
        }
      }
    );

    await t.test(
      "persisted Square artifact blocks review",
      async () => {
        const result = await collect(input);

        assert.equal(
          result.reason,
          "EXISTING_SQUARE_ARTIFACT_DETECTED"
        );
      }
    );

    await t.test(
      "production mode denies database access",
      async () => {
        const previous = process.env.NODE_ENV;

        try {
          process.env.NODE_ENV = "production";

          const result = await collect(input);

          assert.equal(
            result.reason,
            "SANDBOX_ENVIRONMENT_REQUIRED"
          );
        } finally {
          process.env.NODE_ENV = previous;
        }
      }
    );

    console.log(
      "REAL MONGODB EVIDENCE CHECKS COMPLETE"
    );
  } finally {
    try {
      if (
        inserted &&
        connection.readyState === 1 &&
        connection.db?.databaseName === database
      ) {
        const result = await connection.db
          .collection(collectionName)
          .deleteOne({ orderId });

        assert.equal(
          result.deletedCount,
          1,
          "SYNTHETIC_RECORD_CLEANUP_FAILED"
        );

        console.log(
          "TEMPORARY EVIDENCE RECORD REMOVED"
        );
      }
    } finally {
      await connection.close();
    }
  }
});
