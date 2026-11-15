import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ServerBoundFirstPaymentReview
} from "../utils/createV3ServerBoundFirstPaymentReview.js";

import {
  createV3SandboxOwnershipSnapshotReader
} from "../utils/createV3SandboxOwnershipSnapshotReader.js";

import {
  collectV3SandboxOrderRecordEvidence
} from "../utils/collectV3SandboxOrderRecordEvidence.js";

import {
  collectV3SandboxPaymentRecordEvidence
} from "../utils/collectV3SandboxPaymentRecordEvidence.js";

const orderId = "507f1f77bcf86cd799439011";

const expectedKeys = [
  "signavi_store:orders",
  "signavi_store:smart_shipping_v3_payment_operations",
  "signavi_shipping_v3_dev:smart_shipping_v3_purchase_ownership",
  "signavi_shipping_v3_dev:smart_shipping_v3_payment_operations"
];

function fixture({ failOn = null } = {}) {
  const calls = [];

  const values = {
    "signavi_store:orders": { _id: orderId },
    "signavi_store:smart_shipping_v3_payment_operations": null,
    "signavi_shipping_v3_dev:smart_shipping_v3_purchase_ownership": null,
    "signavi_shipping_v3_dev:smart_shipping_v3_payment_operations": null
  };

  function connection(databaseName) {
    return {
      readyState: 1,
      db: { databaseName },
      collection(name) {
        const key = `${databaseName}:${name}`;

        return {
          async findOne(filter) {
            calls.push({ key, filter });

            if (key === failOn) {
              throw new Error("Simulated MongoDB failure");
            }

            if (!Object.hasOwn(values, key)) {
              throw new Error(`Unexpected collection: ${key}`);
            }

            return values[key];
          }
        };
      }
    };
  }

  return {
    calls,
    values,
    storefrontConnection: connection("signavi_store"),
    sandboxConnection: connection("signavi_shipping_v3_dev")
  };
}

function service(input) {
  const ownership =
    createV3SandboxOwnershipSnapshotReader(input);

  return createV3ServerBoundFirstPaymentReview({
    readKnownHistory: async () => ({
      orderId,
      environment: "sandbox",
      knownRecordsClear: true
    }),

    readPaymentLinks: async () => ({
      orderId,
      environment: "sandbox",
      complete: true,
      hasMore: false,
      timedOut: false,
      priorActivityFound: false,
      existingPayment: false,
      existingLink: false,
      conflicting: false,
      identityMismatch: false
    }),

    readSquareOrders: async ({ orderId: id }) =>
      collectV3SandboxOrderRecordEvidence({
        orderId: id,
        listPage: async () => ({
          orders: [],
          cursor: null
        })
      }),

    readSquarePayments: async ({ orderId: id }) =>
      collectV3SandboxPaymentRecordEvidence({
        orderId: id,
        listPage: async () => ({
          payments: [],
          cursor: null
        })
      }),

    readOwnership: ownership
  });
}

function assertBlocked(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(Object.isFrozen(result), true);
}

test("real ownership reader queries four isolated collections", async () => {
  const input = fixture();

  const reader = createV3SandboxOwnershipSnapshotReader(input);

  const ownership = await reader({ orderId });

  assert.deepEqual(
    input.calls.map(call => call.key),
    expectedKeys
  );

  assert.equal(ownership.complete, true);
  assert.equal(ownership.exclusive, false);
  assert.equal(ownership.durable, false);
  assert.equal(ownership.squareRequestAuthorized, false);
});

test("real ownership and Square readers remain review-only", async () => {
  const input = fixture();

  const reviewService = service(input);
  const result = await reviewService.review(orderId);

  assertBlocked(result);

  assert.deepEqual(
    input.calls.map(call => call.key),
    expectedKeys
  );
});

test("ownership database failure cannot clear review", async () => {
  const input = fixture({
    failOn:
      "signavi_shipping_v3_dev:smart_shipping_v3_purchase_ownership"
  });

  const reader = createV3SandboxOwnershipSnapshotReader(input);
  const ownership = await reader({ orderId });

  assert.equal(ownership.complete, false);
  assert.equal(
    ownership.reason,
    "OWNERSHIP_DATABASE_READ_FAILED"
  );

  const reviewService = service(fixture({
    failOn:
      "signavi_shipping_v3_dev:smart_shipping_v3_purchase_ownership"
  }));

  const result = await reviewService.review(orderId);

  assertBlocked(result);
});
