import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

import {
  runV3LocalAtomicInitializationClaim
} from "../utils/runV3LocalAtomicInitializationClaim.js";

const URI = "mongodb://127.0.0.1:27028/?directConnection=true";

test("real reusable ownership primitive is atomic", async () => {
  const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: 5000,
    retryWrites: false
  });

  const prefix = "v3_tx_probe_" + randomUUID().replaceAll("-", "");
  const orderId = "synthetic-init-order";
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSquareEnv = process.env.SQUARE_ENVIRONMENT;
  const created = [];

  try {
    process.env.NODE_ENV = "test";
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    await client.connect();

    const hello = await client.db("admin").command({ hello: 1 });
    assert.equal(hello.setName, "signaviV3TestRS");
    assert.equal(hello.isWritablePrimary, true);

    const defs = [
      ["signavi_store", `${prefix}_store`],
      ["signavi_shipping_v3_dev", `${prefix}_orders`],
      ["signavi_shipping_v3_dev", `${prefix}_operations`]
    ];

    for (const [database, name] of defs) {
      const db = client.db(database);
      assert.equal(
        await db.listCollections({ name }, { nameOnly: true }).hasNext(),
        false
      );
    }

    for (const [database, name] of defs) {
      const db = client.db(database);
      await db.createCollection(name);
      created.push([db, name]);
    }

    const store = client.db("signavi_store")
      .collection(`${prefix}_store`);
    const orders = client.db("signavi_shipping_v3_dev")
      .collection(`${prefix}_orders`);
    const operations = client.db("signavi_shipping_v3_dev")
      .collection(`${prefix}_operations`);

    await store.insertOne({
      _id: orderId,
      revision: 0,
      owner: null,
      paymentStatus: "unpaid"
    });

    const request = {
      client,
      collectionPrefix: prefix,
      orderId,
      expectedRevision: 0
    };

    await assert.rejects(
      runV3LocalAtomicInitializationClaim({
        ...request,
        owner: "failed",
        injectFailure: true
      }),
      /V3_TEST_INJECTED_ROLLBACK/
    );

    assert.equal((await store.findOne({ _id: orderId })).owner, null);
    assert.equal(await orders.countDocuments({}), 0);
    assert.equal(await operations.countDocuments({}), 0);

    const outcomes = await Promise.allSettled([
      runV3LocalAtomicInitializationClaim({
        ...request,
        owner: "A"
      }),
      runV3LocalAtomicInitializationClaim({
        ...request,
        owner: "B"
      })
    ]);

    const won = outcomes.filter(x => x.status === "fulfilled");
    const lost = outcomes.filter(x => x.status === "rejected");

    assert.equal(won.length, 1);
    assert.equal(lost.length, 1);

    const winner = won[0].value.owner;

    assert.equal(won[0].value.paymentCreated, false);
    assert.equal(won[0].value.squareRequestAuthorized, false);
    assert.equal(won[0].value.retryAuthorized, false);

    assert.equal((await store.findOne({ _id: orderId })).owner, winner);
    assert.equal((await store.findOne({ _id: orderId })).revision, 1);
    assert.equal((await orders.findOne({ _id: orderId })).owner, winner);
    assert.equal((await operations.findOne({ _id: orderId })).owner, winner);

    assert.equal(await orders.countDocuments({}), 1);
    assert.equal(await operations.countDocuments({}), 1);

    await assert.rejects(
      runV3LocalAtomicInitializationClaim({
        ...request,
        owner: "duplicate"
      }),
      /V3_INITIALIZATION_OWNERSHIP_REJECTED/
    );

    console.log("Rollback, concurrent ownership, and duplicate rejection verified.");
  } finally {
    try {
      for (const [db, name] of created.reverse()) {
        await db.collection(name).drop();
      }
      console.log("Temporary collections cleaned up.");
    } finally {
      await client.close();

      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;

      if (previousSquareEnv === undefined) {
        delete process.env.SQUARE_ENVIRONMENT;
      } else {
        process.env.SQUARE_ENVIRONMENT = previousSquareEnv;
      }
    }
  }
});