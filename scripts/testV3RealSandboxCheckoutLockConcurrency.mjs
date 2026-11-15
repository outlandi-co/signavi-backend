import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  getV3SandboxConnection
} from "../utils/v3SandboxDatabaseConnection.js";

import {
  getV3SandboxModels
} from "../utils/v3SandboxModels.js";

import {
  acquireV3IsolatedCheckoutLock,
  releaseV3IsolatedCheckoutLock
} from "../utils/smartShippingV3CheckoutLock.js";

test("real sandbox checkout lock permits one competing owner", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox");
  assert.equal(
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED,
    "false"
  );

  const connection = await getV3SandboxConnection();

  assert.equal(connection.readyState, 1);
  assert.equal(
    connection.db.databaseName,
    "signavi_shipping_v3_dev"
  );
  assert.notEqual(connection, mongoose.connection);

  const { CheckoutLock } = getV3SandboxModels(connection);

  assert.equal(CheckoutLock.db, connection);

  const orderId = new mongoose.Types.ObjectId();
  const id = String(orderId);

  let winningLock = null;
  let subsequentLock = null;

  try {
    assert.equal(
      await CheckoutLock.collection.findOne({ _id: orderId }),
      null
    );

    const attempts = await Promise.all([
      acquireV3IsolatedCheckoutLock(id, { CheckoutLock }),
      acquireV3IsolatedCheckoutLock(id, { CheckoutLock })
    ]);

    const winners = attempts.filter(Boolean);
    const losers = attempts.filter(value => value === null);

    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);

    winningLock = winners[0];

    assert.equal(winningLock.orderId, id);
    assert.equal(typeof winningLock.owner, "string");
    assert.ok(winningLock.owner.length > 0);

    console.log("ONE_CONCURRENT_LOCK_WINNER_VERIFIED");

    const persisted = await CheckoutLock.collection.findOne({
      _id: orderId
    });

    assert.ok(persisted);
    assert.equal(persisted.owner, winningLock.owner);

    console.log("PERSISTED_LOCK_OWNER_VERIFIED");

    const forgedRelease =
      await releaseV3IsolatedCheckoutLock(
        {
          orderId: id,
          owner: "wrong-synthetic-owner"
        },
        { CheckoutLock }
      );

    assert.equal(forgedRelease, false);

    assert.ok(
      await CheckoutLock.collection.findOne({
        _id: orderId,
        owner: winningLock.owner
      })
    );

    console.log("FOREIGN_OWNER_CANNOT_RELEASE_LOCK");

    const blocked =
      await acquireV3IsolatedCheckoutLock(
        id,
        { CheckoutLock }
      );

    assert.equal(blocked, null);

    console.log("SECOND_ACQUISITION_BLOCKED");

    const released =
      await releaseV3IsolatedCheckoutLock(
        winningLock,
        { CheckoutLock }
      );

    assert.equal(released, true);
    winningLock = null;

    assert.equal(
      await CheckoutLock.collection.findOne({ _id: orderId }),
      null
    );

    console.log("LEGITIMATE_OWNER_RELEASE_VERIFIED");

    subsequentLock =
      await acquireV3IsolatedCheckoutLock(
        id,
        { CheckoutLock }
      );

    assert.ok(subsequentLock);
    assert.equal(subsequentLock.orderId, id);

    console.log("ACQUISITION_AFTER_RELEASE_VERIFIED");

    assert.equal(
      await releaseV3IsolatedCheckoutLock(
        subsequentLock,
        { CheckoutLock }
      ),
      true
    );

    subsequentLock = null;

    assert.equal(
      await CheckoutLock.collection.findOne({ _id: orderId }),
      null
    );

    console.log("SYNTHETIC_LOCK_CLEANUP_VERIFIED");
    console.log("NO_SQUARE_EXECUTION_PATH_INVOKED");
  } finally {
    try {
      // Remove only records owned by this synthetic test.
      for (const lock of [winningLock, subsequentLock]) {
        if (lock?.owner) {
          await CheckoutLock.collection.deleteOne({
            _id: orderId,
            owner: lock.owner
          });
        }
      }
    } finally {
      await connection.close();
      console.log("SANDBOX_CONNECTION_CLOSED");
    }
  }
});
