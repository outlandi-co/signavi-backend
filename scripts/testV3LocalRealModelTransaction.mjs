import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import Order from "../models/Order.js";
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js";

import {
  buildV3SandboxStorefrontOwnershipClaim
} from "../utils/buildV3SandboxStorefrontOwnershipClaim.js";

import {
  assessV3SharedTransactionTopology
} from "../utils/assessV3SharedTransactionTopology.js";

const URI =
  "mongodb://127.0.0.1:27028/signavi_store?directConnection=true";

test("actual Signavi schemas support shared-session atomic initialization", async () => {
  const prefix = "v3_step163_" + randomUUID().replaceAll("-", "");

  const store = mongoose.createConnection(URI, {
    serverSelectionTimeoutMS: 5000,
    autoCreate: false,
    autoIndex: false
  });

  const created = [];

  try {
    await store.asPromise();

    const hello = await store.db.admin().command({ hello: 1 });

    assert.equal(hello.setName, "signaviV3TestRS");
    assert.equal(hello.isWritablePrimary, true);

    assert.equal(store.host, "127.0.0.1");
    assert.equal(Number(store.port), 27028);
    assert.equal(store.db.databaseName, "signavi_store");

    const sandbox = store.useDb("signavi_shipping_v3_dev", {
      useCache: true
    });

    const topology = assessV3SharedTransactionTopology({
      storefrontConnection: store,
      sandboxConnection: sandbox
    });

    assert.equal(topology.compatible, true);
    assert.equal(topology.squareRequestAuthorized, false);

    const names = {
      storefrontOrder: `${prefix}_store_orders`,
      storefrontOperation: `${prefix}_store_operations`,
      sandboxOrder: `${prefix}_sandbox_orders`,
      sandboxOperation: `${prefix}_sandbox_operations`
    };

    const bindings = [
      [store, names.storefrontOrder],
      [store, names.storefrontOperation],
      [sandbox, names.sandboxOrder],
      [sandbox, names.sandboxOperation]
    ];

    for (const [connection, name] of bindings) {
      assert.equal(
        await connection.db
          .listCollections({ name }, { nameOnly: true })
          .hasNext(),
        false
      );
    }

    for (const [connection, name] of bindings) {
      await connection.db.createCollection(name);
      created.push([connection, name]);
    }

    const StoreOrder = store.model(
      "V3Step163StoreOrder",
      Order.schema.clone(),
      names.storefrontOrder
    );

    const StoreOperation = store.model(
      "V3Step163StoreOperation",
      PaymentOperation.schema.clone(),
      names.storefrontOperation
    );

    const SandboxOrder = sandbox.model(
      "V3Step163SandboxOrder",
      Order.schema.clone(),
      names.sandboxOrder
    );

    const SandboxOperation = sandbox.model(
      "V3Step163SandboxOperation",
      PaymentOperation.schema.clone(),
      names.sandboxOperation
    );

    assert.equal(StoreOrder.db, store);
    assert.equal(StoreOperation.db, store);
    assert.equal(SandboxOrder.db, sandbox);
    assert.equal(SandboxOperation.db, sandbox);

    const orderId = new mongoose.Types.ObjectId();

    await StoreOrder.collection.insertOne({
      _id: orderId,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      squareEnvironment: "sandbox",
      squareExpectedAmountCents: 4722,
      squarePaymentId: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      paidAt: null,
      v3SandboxInitializationOwner: "",
      v3SandboxInitializationRevision: 0
    });

    await StoreOperation.collection.insertOne({
      orderId,
      environment: "sandbox",
      status: "pending",
      requestOwner: "",
      amountCents: 4722,
      idempotencyKey: "signavi-v3-sandbox-" + orderId,
      checkoutReferenceId: "checkout-step163",
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: "",
      squarePaymentId: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      squareDiagnostic: null,
      lastError: ""
    });

    async function initialize(owner, injectFailure = false) {
      const session = await store.startSession();

      try {
        return await session.withTransaction(async () => {
          const freshOrder = await StoreOrder.collection.findOne(
            { _id: orderId },
            { session }
          );

          const freshOperation = await StoreOperation.collection.findOne(
            { orderId },
            { session }
          );

          if (!freshOrder || !freshOperation) {
            throw new Error("FRESH_STOREFRONT_STATE_REQUIRED");
          }

          if (
            freshOperation.status !== "pending" ||
            freshOperation.requestOwner !== "" ||
            freshOperation.amountCents !== 4722 ||
            freshOperation.squareCreationAttemptClaimedAt != null ||
            freshOperation.squarePaymentId
          ) {
            throw new Error("STOREFRONT_OPERATION_NOT_PRISTINE");
          }

          const claim = buildV3SandboxStorefrontOwnershipClaim({
            orderId: orderId.toString(),
            amountCents: 4722,
            expectedRevision: 0,
            owner
          });

          const result = await StoreOrder.collection.updateOne(
            claim.filter,
            claim.update,
            { session }
          );

          if (result.matchedCount !== 1) {
            throw new Error("OWNERSHIP_CLAIM_REJECTED");
          }

          const existingOrder = await SandboxOrder.collection.findOne(
            { _id: orderId },
            { session }
          );

          const existingOperation =
            await SandboxOperation.collection.findOne(
              { orderId },
              { session }
            );

          if (existingOrder || existingOperation) {
            throw new Error("SANDBOX_RECORD_ALREADY_EXISTS");
          }

          await SandboxOrder.collection.insertOne(
            { ...freshOrder },
            { session }
          );

          if (injectFailure) {
            throw new Error("INJECTED_ROLLBACK");
          }

          await SandboxOperation.collection.insertOne(
            { ...freshOperation },
            { session }
          );

          return {
            initialized: true,
            owner,
            squareRequestAuthorized: false,
            paymentCreated: false,
            retryAuthorized: false
          };
        });
      } finally {
        await session.endSession();
      }
    }

    console.log("Testing rollback of real-model transaction...");

    await assert.rejects(
      initialize("checkout:rollback-test", true),
      /INJECTED_ROLLBACK/
    );

    const afterRollback = await StoreOrder.collection.findOne({
      _id: orderId
    });

    assert.equal(afterRollback.v3SandboxInitializationOwner, "");
    assert.equal(afterRollback.v3SandboxInitializationRevision, 0);
    assert.equal(await SandboxOrder.collection.countDocuments({}), 0);
    assert.equal(await SandboxOperation.collection.countDocuments({}), 0);

    console.log("Testing real-model concurrent initialization...");

    const outcomes = await Promise.allSettled([
      initialize("checkout:real-model-A"),
      initialize("checkout:real-model-B")
    ]);

    const winners = outcomes.filter(x => x.status === "fulfilled");
    const losers = outcomes.filter(x => x.status === "rejected");

    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);

    const winner = winners[0].value.owner;

    assert.equal(winners[0].value.squareRequestAuthorized, false);
    assert.equal(winners[0].value.paymentCreated, false);

    const finalOrder = await StoreOrder.collection.findOne({
      _id: orderId
    });

    assert.equal(finalOrder.v3SandboxInitializationOwner, winner);
    assert.equal(finalOrder.v3SandboxInitializationRevision, 1);

    assert.equal(
      await SandboxOrder.collection.countDocuments({ _id: orderId }),
      1
    );

    assert.equal(
      await SandboxOperation.collection.countDocuments({ orderId }),
      1
    );

    console.log("Exactly one initializer succeeded.");
    console.log("Real schema bindings and ownership verified.");
  } finally {
    try {
      for (const [connection, name] of created.reverse()) {
        await connection.db.collection(name).drop();
      }

      console.log("Temporary test collections removed.");
    } finally {
      await store.close();
    }
  }
});