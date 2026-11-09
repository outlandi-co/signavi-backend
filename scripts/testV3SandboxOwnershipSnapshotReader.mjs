import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxOwnershipSnapshotReader
} from "../utils/createV3SandboxOwnershipSnapshotReader.js";

const orderId = "507f1f77bcf86cd799439011";

function fixture({
  existingPurchase = null,
  existingSandboxOperation = null,
  existingStorefrontOperation = null,
  storefrontOrder = { _id: orderId },
  throwOnRead = false
} = {}) {
  const calls = [];

  const values = {
    "signavi_store:orders": storefrontOrder,
    "signavi_store:smart_shipping_v3_payment_operations":
      existingStorefrontOperation,
    "signavi_shipping_v3_dev:smart_shipping_v3_purchase_ownership":
      existingPurchase,
    "signavi_shipping_v3_dev:smart_shipping_v3_payment_operations":
      existingSandboxOperation
  };

  const makeConnection = databaseName => ({
    readyState: 1,
    db: { databaseName },
    collection(name) {
      return {
        async findOne(filter) {
          calls.push({ databaseName, name, filter });
          if (throwOnRead) throw new Error("Mock read failed");

          const key = `${databaseName}:${name}`;

          if (!(key in values)) {
            throw new Error("Unexpected collection: " + key);
          }

          return values[key];
        }
      };
    }
  });

  return {
    calls,
    storefrontConnection: makeConnection("signavi_store"),
    sandboxConnection:
      makeConnection("signavi_shipping_v3_dev")
  };
}

test("reads both databases without authorizing checkout", async () => {
  const input = fixture();
  const reader = createV3SandboxOwnershipSnapshotReader(input);
  const result = await reader({ orderId });

  assert.equal(result.complete, true);
  assert.equal(result.exclusive, false);
  assert.equal(result.durable, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(input.calls.length, 4);
});

test("uses exact Sandbox purchase-key identity", async () => {
  const input = fixture();
  const reader = createV3SandboxOwnershipSnapshotReader(input);

  await reader({ orderId });

  const claimQuery = input.calls.find(
    call => call.name === "smart_shipping_v3_purchase_ownership"
  );

  assert.equal(claimQuery.filter.environment, "sandbox");
  assert.equal(claimQuery.filter.purchaseKey, `order:${orderId}`);
});

test("existing purchase claim prevents clearance", async () => {
  const input = fixture({
    existingPurchase: {
      environment: "sandbox",
      purchaseKey: `order:${orderId}`
    }
  });

  const result =
    await createV3SandboxOwnershipSnapshotReader(input)({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.reason, "EXISTING_SANDBOX_PURCHASE_CLAIM");
});

test("existing Sandbox operation prevents clearance", async () => {
  const input = fixture({
    existingSandboxOperation: {
      status: "reconciliation_required"
    }
  });

  const result =
    await createV3SandboxOwnershipSnapshotReader(input)({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.reason, "EXISTING_SANDBOX_PAYMENT_OPERATION");
});

test("database read failure returns blocked evidence", async () => {
  const input = fixture({ throwOnRead: true });

  const result =
    await createV3SandboxOwnershipSnapshotReader(input)({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.reason, "OWNERSHIP_DATABASE_READ_FAILED");
  assert.equal(result.squareRequestAuthorized, false);
});

test("wrong database boundary is rejected", () => {
  const input = fixture();
  input.sandboxConnection.db.databaseName = "signavi_store";

  assert.throws(
    () => createV3SandboxOwnershipSnapshotReader(input),
    /OWNERSHIP_DATABASE_BOUNDARY_REJECTED/
  );
});