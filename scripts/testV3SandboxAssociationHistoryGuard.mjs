import test from "node:test";
import assert from "node:assert/strict";

import Order from "../models/Order.js";
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js";
import PurchaseOwnership from "../models/SmartShippingV3PurchaseOwnership.js";
import SquareReservation from "../models/SquarePaymentCreationReservation.js";
import SharedReservation from "../models/SharedSquarePaymentReservation.js";
import Association from "../models/SmartShippingV3InvoiceOrderAssociation.js";

import {
  createV3SandboxLocalHistoryReader
} from "../utils/createV3SandboxLocalHistoryReader.js";

const orderId = "507f1f77bcf86cd799439011";
const invoiceId = "507f1f77bcf86cd799439022";

const STORE = "signavi_store";
const SANDBOX = "signavi_shipping_v3_dev";

function fixture(existingAssociation = null) {
  const records = new Map([
    [
      `${STORE}:${Order.collection.name}`,
      { _id: orderId, paymentStatus: "payment_required" }
    ],
    [
      `${STORE}:${Association.collection.name}`,
      existingAssociation
    ]
  ]);

  const queriedCollections = [];

  function connection(databaseName) {
    return {
      readyState: 1,
      db: { databaseName },

      collection(name) {
        return {
          async findOne(filter) {
            queriedCollections.push({
              databaseName,
              name,
              filter
            });

            const key = `${databaseName}:${name}`;

            return records.has(key) ? records.get(key) : null;
          }
        };
      }
    };
  }

  return {
    queriedCollections,
    storefrontConnection: connection(STORE),
    sandboxConnection: connection(SANDBOX)
  };
}

function createReader(db) {
  return createV3SandboxLocalHistoryReader({
    storefrontConnection: db.storefrontConnection,
    sandboxConnection: db.sandboxConnection
  });
}

test("clean local history never authorizes payment", async () => {
  const db = fixture();

  const result = await createReader(db)({ orderId });

  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
});

test("existing durable invoice association must block clearance", async () => {
  const db = fixture({
    environment: "sandbox",
    invoiceId,
    orderId,
    purchaseKey: `order:${orderId}`
  });

  const result = await createReader(db)({ orderId });

  assert.equal(result.knownRecordsClear, false);
  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);

  const lookup = db.queriedCollections.find(call =>
    call.databaseName === STORE &&
    call.name === Association.collection.name
  );

  assert.ok(
    lookup,
    "Storefront durable association must be queried"
  );

  assert.equal(lookup.filter.environment, "sandbox");
  assert.equal(String(lookup.filter.orderId), orderId);
});