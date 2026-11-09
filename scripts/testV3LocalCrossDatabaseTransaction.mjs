import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

const URI = "mongodb://127.0.0.1:27028/?directConnection=true";
const EXPECTED_REPLICA_SET = "signaviV3TestRS";

test("real local shared-session transaction rolls back and commits across databases", async () => {
  const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    retryWrites: false
  });

  const collectionName =
    "v3_tx_probe_" + randomUUID().replaceAll("-", "");

  let connected = false;
  let createdStorefront = false;
  let createdSandbox = false;
  let session;

  try {
    await client.connect();
    connected = true;

    const hello = await client.db("admin").command({ hello: 1 });

    assert.equal(
      hello.setName,
      EXPECTED_REPLICA_SET,
      "STOP: Unexpected MongoDB replica set"
    );

    assert.equal(
      hello.isWritablePrimary,
      true,
      "STOP: Isolated replica set is not primary"
    );

    const storefrontDb = client.db("signavi_store");
    const sandboxDb = client.db("signavi_shipping_v3_dev");

    assert.notEqual(storefrontDb.databaseName, sandboxDb.databaseName);

    const storefrontExists = await storefrontDb
      .listCollections({ name: collectionName }, { nameOnly: true })
      .hasNext();

    const sandboxExists = await sandboxDb
      .listCollections({ name: collectionName }, { nameOnly: true })
      .hasNext();

    assert.equal(storefrontExists, false);
    assert.equal(sandboxExists, false);

    const storefront = await storefrontDb.createCollection(collectionName);
    createdStorefront = true;

    const sandbox = await sandboxDb.createCollection(collectionName);
    createdSandbox = true;

    session = client.startSession();

    console.log("Testing transaction rollback...");

    session.startTransaction();

    await storefront.insertOne(
      { _id: "rollback-storefront", source: "v3-local-test" },
      { session }
    );

    await sandbox.insertOne(
      { _id: "rollback-sandbox", source: "v3-local-test" },
      { session }
    );

    await session.abortTransaction();

    assert.equal(await storefront.countDocuments({}), 0);
    assert.equal(await sandbox.countDocuments({}), 0);

    console.log("Rollback verified in both databases.");

    console.log("Testing transaction commit...");

    session.startTransaction();

    await storefront.insertOne(
      { _id: "commit-storefront", source: "v3-local-test" },
      { session }
    );

    await sandbox.insertOne(
      { _id: "commit-sandbox", source: "v3-local-test" },
      { session }
    );

    await session.commitTransaction();

    assert.equal(
      await storefront.countDocuments({ _id: "commit-storefront" }),
      1
    );

    assert.equal(
      await sandbox.countDocuments({ _id: "commit-sandbox" }),
      1
    );

    console.log("Commit verified in both databases.");
  } finally {
    if (session) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      await session.endSession();
    }

    if (connected) {
      try {
        if (createdStorefront) {
          await client
            .db("signavi_store")
            .collection(collectionName)
            .drop();
        }

        if (createdSandbox) {
          await client
            .db("signavi_shipping_v3_dev")
            .collection(collectionName)
            .drop();
        }

        console.log("Temporary test collections removed.");
      } finally {
        await client.close();
      }
    } else {
      await client.close();
    }
  }
});