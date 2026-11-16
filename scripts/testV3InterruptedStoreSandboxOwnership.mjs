import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient, ObjectId } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
  buildV3SandboxStorefrontOwnershipClaim
} from "../utils/buildV3SandboxStorefrontOwnershipClaim.js";

test("disposable MongoDB enforces atomic storefront ownership claims", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox");

  for (const name of [
    "MONGO_URI",
    "MONGODB_URI",
    "V3_SANDBOX_MONGO_URI",
    "SQUARE_ACCESS_TOKEN",
    "SQUARE_SANDBOX_ACCESS_TOKEN",
    "SQUARE_PRODUCTION_ACCESS_TOKEN"
  ]) {
    assert.equal(process.env[name], undefined);
  }

  let replica;
  let client;

  try {
    replica = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: "wiredTiger"
      }
    });

    const uri = replica.getUri();
    const parsed = new URL(uri);

    assert.equal(parsed.protocol, "mongodb:");

    for (const host of parsed.host.split(",")) {
      assert.match(
        host,
        /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/
      );
    }

    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000
    });

    await client.connect();

    const collection = client
      .db("signavi_store")
      .collection("temporary_v3_storefront_claims");

    const ids = {
      normal: new ObjectId(),
      paid: new ObjectId(),
      legacy: new ObjectId(),
      concurrent: new ObjectId()
    };

    const makeOrder = (id, changes = {}) => ({
      _id: id,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      squareEnvironment: "sandbox",
      squareExpectedAmountCents: 4722,
      v3SandboxInitializationOwner: "",
      v3SandboxInitializationRevision: 0,
      squarePaymentId: null,
      squarePaymentLinkId: null,
      squareOrderId: null,
      paymentUrl: null,
      paidAt: null,
      ...changes
    });

    const legacy = makeOrder(ids.legacy);
    delete legacy.v3SandboxInitializationOwner;
    delete legacy.v3SandboxInitializationRevision;

    await collection.insertMany([
      makeOrder(ids.normal),
      makeOrder(ids.paid, {
        paymentStatus: "paid",
        squarePaymentId: "existing-payment"
      }),
      legacy,
      makeOrder(ids.concurrent)
    ]);

    console.log("PASS: ISOLATED TEST ORDERS CREATED");

    async function attempt(id, owner) {
      const claim = buildV3SandboxStorefrontOwnershipClaim({
        orderId: id.toHexString(),
        amountCents: 4722,
        expectedRevision: 0,
        owner
      });

      assert.equal(claim.initializationAuthorized, false);
      assert.equal(claim.squareRequestAuthorized, false);
      assert.equal(claim.retryAuthorized, false);

      return collection.updateOne(claim.filter, claim.update);
    }

    // Valid ownership.
    const first = await attempt(
      ids.normal,
      "checkout:normal"
    );

    assert.equal(first.matchedCount, 1);
    assert.equal(first.modifiedCount, 1);

    const owned = await collection.findOne({
      _id: ids.normal
    });

    assert.equal(
      owned.v3SandboxInitializationOwner,
      "checkout:normal"
    );

    assert.equal(
      owned.v3SandboxInitializationRevision,
      1
    );

    console.log("PASS: ATOMIC OWNERSHIP CLAIM");

    // Duplicate ownership.
    const duplicate = await attempt(
      ids.normal,
      "checkout:duplicate"
    );

    assert.equal(duplicate.matchedCount, 0);

    console.log("PASS: DUPLICATE CLAIM REJECTED");

    // Paid orders.
    const paid = await attempt(
      ids.paid,
      "checkout:paid"
    );

    assert.equal(paid.matchedCount, 0);

    console.log("PASS: PAID ORDER REJECTED");

    // Legacy orders.
    const legacyResult = await attempt(
      ids.legacy,
      "checkout:legacy"
    );

    assert.equal(legacyResult.matchedCount, 0);

    console.log("PASS: LEGACY ORDER REJECTED");

    // Concurrent ownership requests.
    const results = await Promise.all([
      attempt(ids.concurrent, "checkout:race-A"),
      attempt(ids.concurrent, "checkout:race-B")
    ]);

    assert.equal(
      results.filter(r => r.matchedCount === 1).length,
      1
    );

    assert.equal(
      results.filter(r => r.matchedCount === 0).length,
      1
    );

    const winner = await collection.findOne({
      _id: ids.concurrent
    });

    assert.ok([
      "checkout:race-A",
      "checkout:race-B"
    ].includes(winner.v3SandboxInitializationOwner));

    assert.equal(
      winner.v3SandboxInitializationRevision,
      1
    );

    assert.equal(
      await collection.countDocuments({}),
      4
    );

    console.log("PASS: CONCURRENT CLAIM RACE BLOCKED");

    // Confirm no payment identifiers were created.
    for (const id of [ids.normal, ids.concurrent]) {
      const order = await collection.findOne({ _id: id });

      assert.equal(order.squarePaymentId, null);
      assert.equal(order.squarePaymentLinkId, null);
      assert.equal(order.squareOrderId, null);
      assert.equal(order.paymentUrl, null);
    }

    console.log("PASS: NO PAYMENT IDENTITIES CREATED");

    // ===== INDEPENDENT STORE/SANDBOX FAILURE REGRESSION =====
    // Test-only simulation. Does not invoke live checkout
    // initialization or the Square SDK.

    const interruptedId = new owned._id.constructor();

    await collection.insertOne({
      ...owned,
      _id: interruptedId,
      v3SandboxInitializationOwner: "",
      v3SandboxInitializationRevision: 0
    });

    const firstInterruptedClaim = await attempt(
      interruptedId,
      "checkout:interrupted"
    );

    assert.equal(firstInterruptedClaim.matchedCount, 1);
    assert.equal(firstInterruptedClaim.modifiedCount, 1);

    const claimedBeforeFailure = await collection.findOne({
      _id: interruptedId
    });

    assert.equal(
      claimedBeforeFailure.v3SandboxInitializationOwner,
      "checkout:interrupted"
    );

    assert.equal(
      claimedBeforeFailure.v3SandboxInitializationRevision,
      1
    );

    // Separate disposable MongoDB deployment and client.
    const sandboxReplica = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" }
    });

    let sandboxClient;

    try {
      const { MongoClient } = await import("mongodb");

      sandboxClient = new MongoClient(
        sandboxReplica.getUri("signavi_shipping_v3_dev")
      );

      await sandboxClient.connect();

      const sandboxCollection = sandboxClient
        .db("signavi_shipping_v3_dev")
        .collection("v3_interrupted_initialization_probe");

      // Seed a conflicting record to inject a real
      // Sandbox database duplicate-key write failure.
      await sandboxCollection.insertOne({
        _id: interruptedId,
        state: "existing"
      });

      await assert.rejects(
        sandboxCollection.insertOne({
          _id: interruptedId,
          state: "initializing"
        }),
        error => error?.code === 11000
      );

      console.log(
        "PASS: INDEPENDENT SANDBOX WRITE FAILURE INJECTED"
      );

      const claimedAfterFailure = await collection.findOne({
        _id: interruptedId
      });

      assert.equal(
        claimedAfterFailure.v3SandboxInitializationOwner,
        "checkout:interrupted"
      );

      assert.equal(
        claimedAfterFailure.v3SandboxInitializationRevision,
        1
      );

      const repeatClaim = await attempt(
        interruptedId,
        "checkout:retry"
      );

      assert.equal(repeatClaim.matchedCount, 0);

      console.log(
        "PASS: STORE OWNERSHIP RETAINED AND RECLAIM BLOCKED"
      );

      const sandboxRecord = await sandboxCollection.findOne({
        _id: interruptedId
      });

      assert.equal(sandboxRecord.state, "existing");

      assert.equal(
        await sandboxCollection.countDocuments({}),
        1
      );

      for (const field of [
        "squarePaymentId",
        "squarePaymentLinkId",
        "squareOrderId",
        "paymentUrl"
      ]) {
        assert.equal(claimedAfterFailure[field], null);
        assert.equal(sandboxRecord[field], undefined);
      }

      console.log(
        "PASS: NO PAYMENT IDENTITIES CREATED"
      );
      console.log(
        "PASS: INDEPENDENT DATABASE INTERRUPTION CONTAINED"
      );
    } finally {
      try {
        if (sandboxClient) {
          await sandboxClient.close();
        }
      } finally {
        await sandboxReplica.stop();
      }

      console.log(
        "PASS: SECOND DISPOSABLE DATABASE CLEANED UP"
      );
    }

  } finally {
    try {
      if (client) {
        await client.close();
      }
    } finally {
      if (replica) {
        await replica.stop();
      }
    }

    console.log("PASS: DISPOSABLE DATABASE CLEANED UP");
  }
});
