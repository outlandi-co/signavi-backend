import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxOwnershipSnapshotReader
} from "../utils/createV3SandboxOwnershipSnapshotReader.js";

import {
  collectV3FirstPaymentEvidenceReadOnly
} from "../utils/collectV3FirstPaymentEvidenceReadOnly.js";

const orderId = "507f1f77bcf86cd799439011";

function fixture({
  storefrontOrder = { _id: orderId },
  storefrontOperation = null,
  sandboxPurchase = null,
  sandboxOperation = null,
  failRead = false
} = {}) {
  const values = {
    "signavi_store:orders": storefrontOrder,
    "signavi_store:smart_shipping_v3_payment_operations":
      storefrontOperation,
    "signavi_shipping_v3_dev:smart_shipping_v3_purchase_ownership":
      sandboxPurchase,
    "signavi_shipping_v3_dev:smart_shipping_v3_payment_operations":
      sandboxOperation
  };

  const calls = [];

  const connection = databaseName => ({
    readyState: 1,
    db: { databaseName },

    collection(name) {
      return {
        async findOne(filter) {
          calls.push({ databaseName, name, filter });

          if (failRead) {
            throw new Error("Simulated database failure");
          }

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
    storefrontConnection: connection("signavi_store"),
    sandboxConnection: connection("signavi_shipping_v3_dev")
  };
}

const clearEvidence = async ({ orderId: id }) => ({
  orderId: id,
  environment: "sandbox",
  complete: true,
  priorActivityFound: false,
  squareRequestAuthorized: false
});

function coordinatorInput(options = {}) {
  const db = fixture(options);

  return {
    db,
    input: {
      orderId,

      readKnownHistory: async ({ orderId: id }) => ({
        orderId: id,
        environment: "sandbox",
        knownRecordsClear: true
      }),

      readPaymentLinks: clearEvidence,
      readSquareOrders: clearEvidence,
      readSquarePayments: clearEvidence,

      readOwnership: createV3SandboxOwnershipSnapshotReader({
        storefrontConnection: db.storefrontConnection,
        sandboxConnection: db.sandboxConnection
      })
    }
  };
}

test("clean snapshot cannot authorize first payment", async () => {
  const { db, input } = coordinatorInput();

  const result =
    await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(db.calls.length, 4);
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(
    result.reason,
    "DURABLE_PURCHASE_OWNERSHIP_NOT_VERIFIED"
  );
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
});

test("existing Sandbox purchase remains blocked", async () => {
  const { input } = coordinatorInput({
    sandboxPurchase: {
      environment: "sandbox",
      purchaseKey: `order:${orderId}`
    }
  });

  const result =
    await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("existing storefront operation remains blocked", async () => {
  const { input } = coordinatorInput({
    storefrontOperation: {
      status: "reconciliation_required"
    }
  });

  const result =
    await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("missing storefront order fails closed", async () => {
  const { input } = coordinatorInput({
    storefrontOrder: null
  });

  const result =
    await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("MongoDB read failure fails closed", async () => {
  const { input } = coordinatorInput({
    failRead: true
  });

  const result =
    await collectV3FirstPaymentEvidenceReadOnly(input);

  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
});