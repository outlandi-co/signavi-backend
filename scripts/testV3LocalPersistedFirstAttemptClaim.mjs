import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import Order from "../models/Order.js";
import {
  evaluateV3FirstAttemptEligibility
} from "../utils/evaluateV3FirstAttemptEligibility.js";

const uri =
  "mongodb://127.0.0.1:27028/signavi_store" +
  "?directConnection=true&serverSelectionTimeoutMS=5000";

test("persisted first attempt and atomic claim race", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const prefix = `v3_step181_${suffix}`;

  const orderCollection = `${prefix}_orders`;
  const claimCollection = `${prefix}_claims`;

  let connection;

  try {
    connection = await mongoose.createConnection(uri).asPromise();

    const hello = await connection.db.admin().command({
      hello: 1
    });

    const hosts = hello.hosts ?? [];

    assert.equal(
      connection.db.databaseName,
      "signavi_store"
    );
    assert.equal(hello.setName, "signaviV3TestRS");
    assert.equal(hello.isWritablePrimary, true);

    assert.ok(
      hosts.every(host =>
        /^127\.0\.0\.1:27028$|^localhost:27028$/.test(host)
      ),
      "Unexpected replica-set host"
    );

    console.log("Verified isolated local replica set.");

    const TempOrder = connection.model(
      `V3Step181Order_${suffix}`,
      Order.schema.clone(),
      orderCollection
    );

    await connection.db.createCollection(orderCollection);
    await connection.db.createCollection(claimCollection);

    const claims = connection.db.collection(claimCollection);
    await claims.createIndex(
      { orderId: 1 },
      { unique: true }
    );

    const id = new mongoose.Types.ObjectId();
    const now = new Date();

    const document = new TempOrder({
      _id: id,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      createdAt: now,
      updatedAt: now,
      v3FirstAttemptProvenanceVersion:
        "storefront-v3-origin-v1",
      v3FirstAttemptProvenanceIssuedAt: now,
      squareEnvironment: null,
      squareExpectedAmountCents: null,
      squarePaymentId: "",
      squareOrderId: "",
      squarePaymentLinkId: "",
      paymentUrl: "",
      v3SandboxInitializationOwner: "",
      v3SandboxInitializationRevision: 0
    });

    // Insert into the private temporary collection.
    // This exercises schema casting and persistence; it does
    // not claim full order-schema validation.
    await TempOrder.collection.insertOne(document.toObject());

    const persisted = await TempOrder.findById(id).lean();

    assert.ok(persisted);

    const eligibility = evaluateV3FirstAttemptEligibility({
      order: persisted
    });

    assert.equal(eligibility.eligible, true);
    assert.equal(eligibility.squareRequestAuthorized, false);

    console.log("Persisted new order is candidate-only.");

    const claimOnce = async owner => {
      const session = await connection.startSession();

      try {
        return await session.withTransaction(async () => {
          const result = await TempOrder.collection.updateOne(
            {
              _id: id,
              source: "store",
              status: "payment_required",
              paymentStatus: "unpaid",
              v3SandboxInitializationOwner: "",
              v3SandboxInitializationRevision: 0,
              squarePaymentId: "",
              squarePaymentLinkId: "",
              squareOrderId: "",
              paymentUrl: ""
            },
            {
              $set: {
                v3SandboxInitializationOwner: owner
              },
              $inc: {
                v3SandboxInitializationRevision: 1
              }
            },
            { session }
          );

          if (result.matchedCount !== 1) {
            throw new Error("CLAIM_ALREADY_CONSUMED");
          }

          await claims.insertOne(
            {
              orderId: id,
              owner,
              amountCents: 4722,
              status: "reserved_for_test_only"
            },
            { session }
          );

          return owner;
        });
      } finally {
        await session.endSession();
      }
    };

    const outcomes = await Promise.allSettled([
      claimOnce("step181-owner-a"),
      claimOnce("step181-owner-b")
    ]);

    const winners = outcomes.filter(
      result => result.status === "fulfilled"
    );

    assert.equal(
      winners.length,
      1,
      "Exactly one concurrent claim must succeed"
    );

    const claimedOrder = await TempOrder.findById(id).lean();
    const savedClaims = await claims.find({
      orderId: id
    }).toArray();

    assert.equal(savedClaims.length, 1);
    assert.equal(
      claimedOrder.v3SandboxInitializationRevision,
      1
    );
    assert.equal(
      claimedOrder.v3SandboxInitializationOwner,
      winners[0].value
    );
    assert.equal(savedClaims[0].owner, winners[0].value);

    console.log("Exactly one concurrent claim committed.");
    console.log("Order and claim ownership match.");

    const retry = await Promise.allSettled([
      claimOnce("step181-owner-c")
    ]);

    assert.equal(retry[0].status, "rejected");

    console.log("Repeated checkout claim rejected.");
    console.log("No Square API requests made.");

  } finally {
    if (connection) {
      try {
        // Only unique, step-prefixed temporary collections.
        for (const name of [claimCollection, orderCollection]) {
          if (!name.startsWith(prefix + "_")) {
            throw new Error("UNSAFE_CLEANUP_TARGET");
          }

          await connection.db
            .collection(name)
            .drop()
            .catch(error => {
              if (error.codeName !== "NamespaceNotFound") {
                throw error;
              }
            });
        }

        console.log("Temporary collections removed.");
      } finally {
        await connection.close();
      }
    }
  }
});