import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxLocalHistoryReader
} from "../utils/createV3SandboxLocalHistoryReader.js";

import {
  createV3SandboxOwnershipSnapshotReader
} from "../utils/createV3SandboxOwnershipSnapshotReader.js";

import {
  collectV3FirstPaymentEvidenceReadOnly
} from "../utils/collectV3FirstPaymentEvidenceReadOnly.js";

const orderId = "507f1f77bcf86cd799439011";
const STORE = "signavi_store";
const SANDBOX = "signavi_shipping_v3_dev";

function fixture(overrides = {}, failRead = false) {
  const values = {
    [`${STORE}:orders`]: {
      _id: orderId,
      paymentStatus: "payment_required"
    },
    [`${STORE}:smart_shipping_v3_invoice_order_associations`]: null,
    [`${STORE}:smart_shipping_v3_production_purchase_reservations`]: null,
    [`${STORE}:smart_shipping_v3_payment_operations`]: null,
    [`${SANDBOX}:smart_shipping_v3_payment_operations`]: null,
    [`${SANDBOX}:smart_shipping_v3_purchase_ownership`]: null,
    [`${STORE}:square_payment_creation_reservations`]: null,
    [`${SANDBOX}:square_payment_creation_reservations`]: null,
    [`${STORE}:shared_square_payment_reservations`]: null,
    [`${SANDBOX}:shared_square_payment_reservations`]: null,
    ...overrides
  };

  const connection = databaseName => ({
    readyState: 1,
    db: { databaseName },

    collection(name) {
      return {
        async findOne() {
          if (failRead) {
            throw new Error("Simulated database failure");
          }

          const key = `${databaseName}:${name}`;

          if (!(key in values)) {
            throw new Error(`Unexpected collection: ${key}`);
          }

          return values[key];
        }
      };
    }
  });

  return {
    storefrontConnection: connection(STORE),
    sandboxConnection: connection(SANDBOX)
  };
}

function clearExternalEvidence({ orderId: id }) {
  return Promise.resolve({
    orderId: id,
    environment: "sandbox",
    complete: true,
    priorActivityFound: false,
    squareRequestAuthorized: false
  });
}

async function runCoordinator(overrides = {}, failRead = false) {
  const db = fixture(overrides, failRead);

  return collectV3FirstPaymentEvidenceReadOnly({
    orderId,

    readKnownHistory: createV3SandboxLocalHistoryReader(db),

    readPaymentLinks: clearExternalEvidence,
    readSquareOrders: clearExternalEvidence,
    readSquarePayments: clearExternalEvidence,

    readOwnership: createV3SandboxOwnershipSnapshotReader(db)
  });
}

function assertBlocked(result) {
  assert.equal(result.readyForAuthorizationReview, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("clear local history cannot bypass atomic ownership", async () => {
  const result = await runCoordinator();

  assertBlocked(result);
  assert.equal(
    result.reason,
    "DURABLE_PURCHASE_OWNERSHIP_NOT_VERIFIED"
  );
});

test("existing Sandbox Square reservation blocks review", async () => {
  const result = await runCoordinator({
    [`${SANDBOX}:square_payment_creation_reservations`]: {
      status: "reserved"
    }
  });

  assertBlocked(result);
});

test("existing storefront payment operation blocks review", async () => {
  const result = await runCoordinator({
    [`${STORE}:smart_shipping_v3_payment_operations`]: {
      status: "reconciliation_required"
    }
  });

  assertBlocked(result);
});

test("database read failure blocks review", async () => {
  const result = await runCoordinator({}, true);

  assertBlocked(result);
});

test("missing storefront order blocks review", async () => {
  const result = await runCoordinator({
    [`${STORE}:orders`]: null
  });

  assertBlocked(result);
});