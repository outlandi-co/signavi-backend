import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId } from "mongodb";

import {
  buildV3SandboxStorefrontOwnershipClaim
} from "../utils/buildV3SandboxStorefrontOwnershipClaim.js";

const URI = "mongodb://127.0.0.1:27028/?directConnection=true";

test("real storefront ownership filter is atomic and fails closed", async () => {
  const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: 5000,
    retryWrites: false
  });

  const name =
    "v3_claim_probe_" + randomUUID().replaceAll("-", "");

  let created = false;

  try {
    await client.connect();

    const hello = await client.db("admin").command({ hello: 1 });

    assert.equal(hello.setName, "signaviV3TestRS");
    assert.equal(hello.isWritablePrimary, true);

    const db = client.db("signavi_store");

    assert.equal(
      await db.listCollections({ name }, { nameOnly: true }).hasNext(),
      false
    );

    await db.createCollection(name);
    created = true;

    const collection = db.collection(name);

    const ids = {
      normal: new ObjectId(),
      concurrent: new ObjectId(),
      paid: new ObjectId(),
      legacy: new ObjectId()
    };

    function fixture(id) {
      return {
        _id: id,
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
      };
    }

    const normal = fixture(ids.normal);
    const concurrent = fixture(ids.concurrent);
    const paid = fixture(ids.paid);
    paid.paymentStatus = "paid";

    const legacy = fixture(ids.legacy);
    delete legacy.v3SandboxInitializationOwner;
    delete legacy.v3SandboxInitializationRevision;

    await collection.insertMany([
      normal,
      concurrent,
      paid,
      legacy
    ]);

    function claim(id, owner) {
      return buildV3SandboxStorefrontOwnershipClaim({
        orderId: id.toHexString(),
        amountCents: 4722,
        expectedRevision: 0,
        owner
      });
    }

    async function attempt(id, owner) {
      const request = claim(id, owner);

      assert.equal(request.initializationAuthorized, false);
      assert.equal(request.squareRequestAuthorized, false);
      assert.equal(request.retryAuthorized, false);

      return collection.updateOne(
        request.filter,
        request.update
      );
    }

    console.log("1. Valid ownership claim...");

    const first = await attempt(
      ids.normal,
      "checkout:normal"
    );

    assert.equal(first.matchedCount, 1);
    assert.equal(first.modifiedCount, 1);

    const updated = await collection.findOne({
      _id: ids.normal
    });

    assert.equal(
      updated.v3SandboxInitializationOwner,
      "checkout:normal"
    );

    assert.equal(
      updated.v3SandboxInitializationRevision,
      1
    );

    console.log("2. Duplicate claim...");

    const duplicate = await attempt(
      ids.normal,
      "checkout:duplicate"
    );

    assert.equal(duplicate.matchedCount, 0);

    console.log("3. Paid order must be rejected...");

    const paidAttempt = await attempt(
      ids.paid,
      "checkout:paid"
    );

    assert.equal(paidAttempt.matchedCount, 0);

    console.log("4. Legacy order missing claim fields...");

    const legacyAttempt = await attempt(
      ids.legacy,
      "checkout:legacy"
    );

    assert.equal(legacyAttempt.matchedCount, 0);

    console.log("5. Concurrent claim race...");

    const results = await Promise.all([
      attempt(ids.concurrent, "checkout:race-A"),
      attempt(ids.concurrent, "checkout:race-B")
    ]);

    assert.equal(
      results.filter(result => result.matchedCount === 1).length,
      1
    );

    assert.equal(
      results.filter(result => result.matchedCount === 0).length,
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

    console.log("All ownership conditions verified.");
  } finally {
    try {
      if (created) {
        await client
          .db("signavi_store")
          .collection(name)
          .drop();

        console.log("Temporary test collection removed.");
      }
    } finally {
      await client.close();
    }
  }
});