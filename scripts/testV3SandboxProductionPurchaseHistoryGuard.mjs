import test from "node:test";
import assert from "node:assert/strict";

import Order from "../models/Order.js";
import ProductionReservation from "../models/SmartShippingV3ProductionPurchaseReservation.js";

import {
  createV3SandboxLocalHistoryReader
} from "../utils/createV3SandboxLocalHistoryReader.js";

const orderId = "507f1f77bcf86cd799439011";
const STORE = "signavi_store";
const SANDBOX = "signavi_shipping_v3_dev";

function fixture(productionPurchase = null) {
  const records = {
    [`${STORE}:${Order.collection.name}`]: {
      _id: orderId,
      paymentStatus: "payment_required"
    },
    [`${STORE}:${ProductionReservation.collection.name}`]:
      productionPurchase
  };

  const calls = [];

  function connection(databaseName) {
    return {
      readyState: 1,
      db: { databaseName },

      collection(name) {
        return {
          async findOne(filter) {
            calls.push({ databaseName, name, filter });

            const record = records[`${databaseName}:${name}`];

            if (!record) return null;

            const matches = Object.entries(filter).every(
              ([key, value]) =>
                String(record[key]) === String(value)
            );

            return matches ? record : null;
          }
        };
      }
    };
  }

  return {
    calls,
    storefrontConnection: connection(STORE),
    sandboxConnection: connection(SANDBOX)
  };
}

async function inspect(db) {
  const reader = createV3SandboxLocalHistoryReader({
    storefrontConnection: db.storefrontConnection,
    sandboxConnection: db.sandboxConnection
  });

  return reader({ orderId });
}

function assertUnauthorized(result) {
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
}

test("clean history remains non-authorizing", async () => {
  const result = await inspect(fixture());

  assert.equal(result.knownRecordsClear, true);
  assertUnauthorized(result);
});

test("existing production purchase claim blocks Sandbox clearance", async () => {
  const db = fixture({
    orderId,
    environment: "production",
    purchaseKey: `signavi-v3-production-purchase-${orderId}`,
    claimedByDocumentType: "order",
    status: "reconciliation_required"
  });

  const result = await inspect(db);

  assert.equal(result.knownRecordsClear, false);
  assert.equal(result.complete, false);
  assertUnauthorized(result);

  const lookup = db.calls.find(call =>
    call.databaseName === STORE &&
    call.name === ProductionReservation.collection.name
  );

  assert.ok(
    lookup,
    "The storefront production purchase collection must be checked"
  );

  assert.equal(lookup.filter.environment, "production");
  assert.equal(String(lookup.filter.orderId), orderId);
});