import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const URI = "mongodb://127.0.0.1:27028/?directConnection=true";
const PREFIX = "v3_tx_probe_" + randomUUID().replaceAll("-", "");

test("local cross-database initialization ownership is atomic", async () => {
  const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: 5000,
    retryWrites: false
  });

  const names = {
    storefront: PREFIX + "_storefront",
    orders: PREFIX + "_orders",
    operations: PREFIX + "_operations"
  };

  const created = [];

  try {
    await client.connect();

    const hello = await client.db("admin").command({ hello: 1 });

    assert.equal(hello.setName, "signaviV3TestRS");
    assert.equal(hello.isWritablePrimary, true);

    const storeDb = client.db("signavi_store");
    const sandboxDb = client.db("signavi_shipping_v3_dev");

    const definitions = [
      [storeDb, names.storefront],
      [sandboxDb, names.orders],
      [sandboxDb, names.operations]
    ];

    // Check every destination before creating any collections.
    for (const [db, name] of definitions) {
      const exists = await db.listCollections(
        { name },
        { nameOnly: true }
      ).hasNext();

      assert.equal(exists, false);
    }

    for (const [db, name] of definitions) {
      await db.createCollection(name);
      created.push([db, name]);
    }

    const storefront = storeDb.collection(names.storefront);
    const orders = sandboxDb.collection(names.orders);
    const operations = sandboxDb.collection(names.operations);

    // These are temporary synthetic test orders, not actual orders.
    await storefront.insertMany([
      { _id: "trial-1", revision: 0, status: "unpaid", owner: null },
      { _id: "trial-2", revision: 0, status: "unpaid", owner: null }
    ]);

    async function initialize({
      orderId,
      expectedRevision,
      owner,
      injectFailure = false
    }) {
      const session = client.startSession();

      try {
        return await session.withTransaction(async () => {
          // This ownership claim is part of the SAME transaction
          // as both isolated document inserts.
          const claimed = await storefront.updateOne(
            {
              _id: orderId,
              revision: expectedRevision,
              status: "unpaid",
              owner: null
            },
            {
              $set: { owner },
              $inc: { revision: 1 }
            },
            { session }
          );

          if (claimed.matchedCount !== 1) {
            throw new Error("OWNERSHIP_CLAIM_REJECTED");
          }

          const existingOrder = await orders.findOne(
            { _id: orderId },
            { session }
          );

          const existingOperation = await operations.findOne(
            { _id: orderId },
            { session }
          );

          if (existingOrder || existingOperation) {
            throw new Error("INITIALIZATION_ALREADY_EXISTS");
          }

          await orders.insertOne(
            { _id: orderId, owner, status: "unpaid" },
            { session }
          );

          if (injectFailure) {
            throw new Error("INJECTED_INITIALIZATION_FAILURE");
          }

          await operations.insertOne(
            { _id: orderId, owner, status: "pending" },
            { session }
          );

          return { initialized: true, owner };
        });
      } finally {
        await session.endSession();
      }
    }

    console.log("1. Stale revision must fail...");

    await assert.rejects(
      initialize({
        orderId: "trial-1",
        expectedRevision: 1,
        owner: "stale"
      }),
      /OWNERSHIP_CLAIM_REJECTED/
    );

    assert.equal(await orders.countDocuments({}), 0);
    assert.equal(await operations.countDocuments({}), 0);

    console.log("2. Injected failure must roll back ownership...");

    await assert.rejects(
      initialize({
        orderId: "trial-1",
        expectedRevision: 0,
        owner: "failed-owner",
        injectFailure: true
      }),
      /INJECTED_INITIALIZATION_FAILURE/
    );

    const afterRollback = await storefront.findOne({
      _id: "trial-1"
    });

    assert.equal(afterRollback.owner, null);
    assert.equal(afterRollback.revision, 0);
    assert.equal(await orders.countDocuments({}), 0);
    assert.equal(await operations.countDocuments({}), 0);

    console.log("3. Valid initialization must commit atomically...");

    const result = await initialize({
      orderId: "trial-1",
      expectedRevision: 0,
      owner: "winner"
    });

    assert.equal(result.initialized, true);

    const claimedOrder = await storefront.findOne({
      _id: "trial-1"
    });

    assert.equal(claimedOrder.owner, "winner");
    assert.equal(claimedOrder.revision, 1);

    assert.equal(
      await orders.countDocuments({ _id: "trial-1" }),
      1
    );

    assert.equal(
      await operations.countDocuments({ _id: "trial-1" }),
      1
    );

    console.log("4. Duplicate initialization must fail...");

    await assert.rejects(
      initialize({
        orderId: "trial-1",
        expectedRevision: 0,
        owner: "duplicate"
      }),
      /OWNERSHIP_CLAIM_REJECTED/
    );

    assert.equal(await orders.countDocuments({}), 1);
    assert.equal(await operations.countDocuments({}), 1);

    console.log("ALL ATOMIC OWNERSHIP CHECKS PASSED");
  } finally {
    // Only uniquely generated temporary collections are dropped.
    try {
      for (const [db, name] of created.reverse()) {
        await db.collection(name).drop();
      }
      console.log("Temporary test collections removed.");
    } finally {
      await client.close();
    }
  }
});