import assert from "node:assert/strict";
import {
  runV3CrossDatabaseCheckoutTransition
} from "../utils/runV3CrossDatabaseCheckoutTransition.js";
import mongoose from "mongoose";
import { createRequire } from "node:module";

const requireOriginal = createRequire(
  "E:/Github-Repositories/signavi-backend/package.json"
);

const { MongoMemoryReplSet } = requireOriginal(
  "mongodb-memory-server"
);
import {
  createV3CrossDatabaseCheckoutModels
} from "../utils/createV3CrossDatabaseCheckoutModels.js";

mongoose.set("autoCreate", false);
mongoose.set("autoIndex", false);

let replica;
let separateConnection;

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  });

  const uri = replica.getUri("signavi_store");

  await mongoose.connect(uri, {
    dbName: "signavi_store",
    serverSelectionTimeoutMS: 10000,
    autoCreate: false,
    autoIndex: false
  });

  const store = mongoose.connection;

  const sandbox = store.useDb(
    "signavi_shipping_v3_dev",
    { useCache: true }
  );

  assert.equal(store.db.databaseName, "signavi_store");
  assert.equal(
    sandbox.db.databaseName,
    "signavi_shipping_v3_dev"
  );
  assert.notEqual(store, sandbox);
  assert.equal(store.getClient(), sandbox.getClient());

  console.log("PASS: Store and Sandbox share one MongoDB client");

  const models = createV3CrossDatabaseCheckoutModels({
    storefrontConnection: store,
    sandboxConnection: sandbox
  });

  assert.equal(models.StoreOrder.db, store);
  assert.equal(models.StoreSharedReservation.db, store);

  for (const name of [
    "SandboxPaymentOperation",
    "SandboxOwnership",
    "SandboxAssociation",
    "SandboxSharedReservation"
  ]) {
    assert.equal(
      models[name].db,
      sandbox,
      `${name} bound to incorrect database`
    );
  }

  console.log("PASS: Store/Sandbox model bindings");

  const second = createV3CrossDatabaseCheckoutModels({
    storefrontConnection: store,
    sandboxConnection: sandbox
  });

  assert.equal(
    second.SandboxPaymentOperation,
    models.SandboxPaymentOperation
  );
  assert.equal(
    second.SandboxOwnership,
    models.SandboxOwnership
  );

  console.log("PASS: Repeated binding reuses model instances");

  assert.throws(
    () => createV3CrossDatabaseCheckoutModels({
      storefrontConnection: store,
      sandboxConnection: store
    }),
    /V3_DATABASE_CONNECTION_REJECTED|V3_SHARED_CLIENT_REQUIRED/
  );

  console.log("PASS: Same database rejected");

  const wrongDatabase = store.useDb(
    "signavi_wrong_test_database",
    { useCache: true }
  );

  assert.throws(
    () => createV3CrossDatabaseCheckoutModels({
      storefrontConnection: store,
      sandboxConnection: wrongDatabase
    }),
    /V3_DATABASE_CONNECTION_REJECTED/
  );

  console.log("PASS: Incorrect database rejected");

  separateConnection = await mongoose
    .createConnection(
      replica.getUri("signavi_shipping_v3_dev"),
      {
        dbName: "signavi_shipping_v3_dev",
        serverSelectionTimeoutMS: 10000,
        autoCreate: false,
        autoIndex: false
      }
    )
    .asPromise();

  assert.notEqual(
    store.getClient(),
    separateConnection.getClient()
  );

  assert.throws(
    () => createV3CrossDatabaseCheckoutModels({
      storefrontConnection: store,
      sandboxConnection: separateConnection
    }),
    /V3_SHARED_CLIENT_REQUIRED/
  );

  console.log("PASS: Independent MongoDB clients rejected");

  console.log("\n===== CROSS-DATABASE TRANSACTION TEST =====");

  const successId = new mongoose.Types.ObjectId();

  const committed = await runV3CrossDatabaseCheckoutTransition({
    storefrontConnection: store,
    sandboxConnection: sandbox,
    transition: async ({ session, models }) => {
      await models.StoreOrder.collection.insertOne(
        { _id: successId, v3TransactionFixture: true },
        { session }
      );

      await models.SandboxPaymentOperation.collection.insertOne(
        {
          _id: new mongoose.Types.ObjectId(),
          orderId: successId,
          v3TransactionFixture: true
        },
        { session }
      );

      return {
        success: true,
        squareRequestAuthorized: false,
        paymentCreated: false
      };
    }
  });

  assert.equal(committed.success, true);

  assert.ok(
    await models.StoreOrder.collection.findOne({ _id: successId })
  );

  assert.ok(
    await models.SandboxPaymentOperation.collection.findOne({
      orderId: successId
    })
  );

  console.log("PASS: Store and Sandbox commit together");

  const rollbackId = new mongoose.Types.ObjectId();

  await assert.rejects(
    runV3CrossDatabaseCheckoutTransition({
      storefrontConnection: store,
      sandboxConnection: sandbox,
      transition: async ({ session, models }) => {
        await models.StoreOrder.collection.insertOne(
          { _id: rollbackId, v3TransactionFixture: true },
          { session }
        );

        await models.SandboxPaymentOperation.collection.insertOne(
          {
            _id: new mongoose.Types.ObjectId(),
            orderId: rollbackId,
            v3TransactionFixture: true
          },
          { session }
        );

        throw new Error("SIMULATED_TRANSACTION_FAILURE");
      }
    }),
    /SIMULATED_TRANSACTION_FAILURE/
  );

  assert.equal(
    await models.StoreOrder.collection.findOne({ _id: rollbackId }),
    null
  );

  assert.equal(
    await models.SandboxPaymentOperation.collection.findOne({
      orderId: rollbackId
    }),
    null
  );

  console.log("PASS: Store and Sandbox rollback together");

  console.log("CROSS-DATABASE TRANSACTION TESTS PASSED");
  console.log("\nPHASE 6.4CN: ALL MODEL-BINDING TESTS PASSED");
  console.log("NO SQUARE REQUESTS");
  console.log("NO CHECKOUT ACTIVATION");
} finally {
  if (separateConnection) {
    await separateConnection.close();
  }

  await mongoose.disconnect();

  if (replica) {
    await replica.stop();
  }

  console.log("PASS: Test connections and replica set closed");
}