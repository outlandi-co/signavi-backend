import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const URI = "mongodb://127.0.0.1:27028/?directConnection=true";

test("two concurrent initializers produce exactly one winner", async () => {
  const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: 5000,
    retryWrites: false
  });

  const prefix = "v3_race_probe_" +
    randomUUID().replaceAll("-", "");

  const definitions = [
    ["signavi_store", prefix + "_store"],
    ["signavi_shipping_v3_dev", prefix + "_orders"],
    ["signavi_shipping_v3_dev", prefix + "_operations"]
  ];

  const created = [];
  let connected = false;

  try {
    await client.connect();
    connected = true;

    const hello = await client.db("admin").command({ hello: 1 });

    assert.equal(hello.setName, "signaviV3TestRS");
    assert.equal(hello.isWritablePrimary, true);

    for (const [database, name] of definitions) {
      const db = client.db(database);

      assert.equal(
        await db.listCollections(
          { name }, { nameOnly: true }
        ).hasNext(),
        false
      );
    }

    for (const [database, name] of definitions) {
      const db = client.db(database);
      await db.createCollection(name);
      created.push([db, name]);
    }

    const storefront = client
      .db(definitions[0][0])
      .collection(definitions[0][1]);

    const orders = client
      .db(definitions[1][0])
      .collection(definitions[1][1]);

    const operations = client
      .db(definitions[2][0])
      .collection(definitions[2][1]);

    const orderId = "synthetic-race-order";

    await storefront.insertOne({
      _id: orderId,
      revision: 0,
      owner: null,
      paymentStatus: "unpaid"
    });

    async function attempt(owner) {
      const session = client.startSession();

      try {
        return await session.withTransaction(async () => {
          const claim = await storefront.updateOne(
            {
              _id: orderId,
              revision: 0,
              owner: null,
              paymentStatus: "unpaid"
            },
            {
              $set: { owner },
              $inc: { revision: 1 }
            },
            { session }
          );

          if (claim.matchedCount !== 1) {
            throw new Error("INITIALIZATION_OWNERSHIP_LOST");
          }

          await orders.insertOne({
            _id: orderId,
            owner
          }, { session });

          await operations.insertOne({
            _id: orderId,
            owner,
            status: "pending"
          }, { session });

          return { owner, initialized: true };
        });
      } finally {
        await session.endSession();
      }
    }

    console.log("Launching two competing transactions...");

    const outcomes = await Promise.allSettled([
      attempt("checkout-A"),
      attempt("checkout-B")
    ]);

    const winners = outcomes.filter(
      result => result.status === "fulfilled"
    );

    const losers = outcomes.filter(
      result => result.status === "rejected"
    );

    assert.equal(
      winners.length,
      1,
      "Exactly one checkout must initialize"
    );

    assert.equal(
      losers.length,
      1,
      "Exactly one competing checkout must fail"
    );

    const winner = winners[0].value.owner;

    const finalStorefront = await storefront.findOne({
      _id: orderId
    });

    const finalOrder = await orders.findOne({
      _id: orderId
    });

    const finalOperation = await operations.findOne({
      _id: orderId
    });

    assert.equal(finalStorefront.owner, winner);
    assert.equal(finalStorefront.revision, 1);
    assert.equal(finalOrder.owner, winner);
    assert.equal(finalOperation.owner, winner);

    assert.equal(
      await orders.countDocuments({ _id: orderId }),
      1
    );

    assert.equal(
      await operations.countDocuments({ _id: orderId }),
      1
    );

    console.log("Winning owner:", winner);
    console.log("Losing attempt rejected.");
    console.log("Exactly one Sandbox order exists.");
    console.log("Exactly one Sandbox operation exists.");
    console.log("Storefront ownership matches winner.");
  } finally {
    try {
      if (connected) {
        for (const [db, name] of created.reverse()) {
          await db.collection(name).drop();
        }

        console.log("Temporary race collections removed.");
      }
    } finally {
      await client.close();
    }
  }
});