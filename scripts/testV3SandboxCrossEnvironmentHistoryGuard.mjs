import test from "node:test";
import assert from "node:assert/strict";

import Order from "../models/Order.js";
import SquareReservation from "../models/SquarePaymentCreationReservation.js";
import SharedReservation from "../models/SharedSquarePaymentReservation.js";

import {
  createV3SandboxLocalHistoryReader
} from "../utils/createV3SandboxLocalHistoryReader.js";

const orderId = "507f1f77bcf86cd799439011";
const STORE = "signavi_store";
const SANDBOX = "signavi_shipping_v3_dev";

function fixture(extraRecords = {}) {
  const records = {
    [`${STORE}:${Order.collection.name}`]: {
      _id: orderId,
      paymentStatus: "payment_required"
    },
    ...extraRecords
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
              ([field, expected]) =>
                String(record[field]) === String(expected)
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

function read(db) {
  return createV3SandboxLocalHistoryReader({
    storefrontConnection: db.storefrontConnection,
    sandboxConnection: db.sandboxConnection
  })({ orderId });
}

function assertNoPaymentAuthorization(result) {
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
}

test("clear mock records remain non-authorizing", async () => {
  const result = await read(fixture());

  assert.equal(result.knownRecordsClear, true);
  assertNoPaymentAuthorization(result);
});

test("existing production Square reservation must block local clearance", async () => {
  const db = fixture({
    [`${STORE}:${SquareReservation.collection.name}`]: {
      orderId,
      environment: "production",
      status: "reconciliation_required"
    }
  });

  const result = await read(db);

  assert.equal(result.knownRecordsClear, false);
  assert.equal(result.complete, false);
  assertNoPaymentAuthorization(result);
});

test("existing production shared reservation must block local clearance", async () => {
  const db = fixture({
    [`${STORE}:${SharedReservation.collection.name}`]: {
      documentType: "order",
      documentId: orderId,
      environment: "production",
      status: "reconciliation_required"
    }
  });

  const result = await read(db);

  assert.equal(result.knownRecordsClear, false);
  assert.equal(result.complete, false);
  assertNoPaymentAuthorization(result);
});