import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxLocalHistoryReader
} from "../utils/createV3SandboxLocalHistoryReader.js";

const orderId = "507f1f77bcf86cd799439011";

const STORE = "signavi_store";
const SANDBOX = "signavi_shipping_v3_dev";

function fixture(overrides = {}) {
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

  const calls = [];
  let failRead = false;

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
    storefrontConnection: connection(STORE),
    sandboxConnection: connection(SANDBOX),
    failReads() {
      failRead = true;
    }
  };
}

function readerFor(db) {
  return createV3SandboxLocalHistoryReader({
    storefrontConnection: db.storefrontConnection,
    sandboxConnection: db.sandboxConnection
  });
}

function assertNoAuthorization(result) {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("clear local history remains non-authorizing", async () => {
  const db = fixture();
  const result = await readerFor(db)({ orderId });

  assert.equal(result.complete, true);
  assert.equal(result.knownRecordsClear, true);
  assert.equal(result.reason, "KNOWN_LOCAL_RECORDS_CLEAR_ONLY");
  assert.equal(result.environment, "sandbox");
  assert.equal(db.calls.length, 12);
  assertNoAuthorization(result);
});

test("invalid order ID fails before database reads", async () => {
  const db = fixture();
  const result = await readerFor(db)({ orderId: "invalid" });

  assert.equal(result.reason, "INVALID_ORDER_ID");
  assert.equal(result.knownRecordsClear, false);
  assert.equal(db.calls.length, 0);
  assertNoAuthorization(result);
});

test("missing storefront order is blocked", async () => {
  const db = fixture({ [`${STORE}:orders`]: null });
  const result = await readerFor(db)({ orderId });

  assert.equal(result.reason, "STOREFRONT_ORDER_NOT_VERIFIED");
  assertNoAuthorization(result);
});

test("paid storefront order is blocked", async () => {
  const db = fixture({
    [`${STORE}:orders`]: {
      _id: orderId,
      paymentStatus: "paid"
    }
  });

  const result = await readerFor(db)({ orderId });

  assert.equal(result.reason, "ORDER_PAYMENT_STATUS_UNSAFE");
  assertNoAuthorization(result);
});

test("existing storefront payment URL is blocked", async () => {
  const db = fixture({
    [`${STORE}:orders`]: {
      _id: orderId,
      paymentStatus: "payment_required",
      paymentUrl: "https://example.invalid/existing"
    }
  });

  const result = await readerFor(db)({ orderId });

  assert.equal(result.reason, "ORDER_HAS_PAYMENT_EVIDENCE");
  assertNoAuthorization(result);
});

for (const [label, key] of [
  [
    "storefront payment operation",
    `${STORE}:smart_shipping_v3_payment_operations`
  ],
  [
    "Sandbox payment operation",
    `${SANDBOX}:smart_shipping_v3_payment_operations`
  ],
  [
    "Sandbox purchase ownership",
    `${SANDBOX}:smart_shipping_v3_purchase_ownership`
  ],
  [
    "storefront Square reservation",
    `${STORE}:square_payment_creation_reservations`
  ],
  [
    "Sandbox Square reservation",
    `${SANDBOX}:square_payment_creation_reservations`
  ],
  [
    "storefront shared reservation",
    `${STORE}:shared_square_payment_reservations`
  ],
  [
    "Sandbox shared reservation",
    `${SANDBOX}:shared_square_payment_reservations`
  ]
]) {
  test(`existing ${label} is blocked`, async () => {
    const db = fixture({
      [key]: { status: "reconciliation_required" }
    });

    const result = await readerFor(db)({ orderId });

    assert.equal(result.complete, false);
    assert.equal(result.knownRecordsClear, false);
    assert.equal(result.reason, "EXISTING_LOCAL_PAYMENT_HISTORY");
    assertNoAuthorization(result);
  });
}

test("database read failure fails closed", async () => {
  const db = fixture();
  db.failReads();

  const result = await readerFor(db)({ orderId });

  assert.equal(result.reason, "LOCAL_PAYMENT_HISTORY_READ_FAILED");
  assertNoAuthorization(result);
});

test("incorrect Sandbox database binding is rejected", () => {
  const db = fixture();

  db.sandboxConnection.db.databaseName = STORE;

  assert.throws(
    () => readerFor(db),
    /SANDBOX_HISTORY_DATABASE_BOUNDARY_REJECTED/
  );
});

test("reader uses the correct Sandbox reservation filter", async () => {
  const db = fixture();

  await readerFor(db)({ orderId });

  const query = db.calls.find(call =>
    call.databaseName === SANDBOX &&
    call.name === "square_payment_creation_reservations"
  );

  assert.ok(query);
  assert.equal(String(query.filter.orderId), orderId);
  assert.equal(query.filter.environment, "sandbox");
});

test("reader uses the exact Sandbox ownership key", async () => {
  const db = fixture();

  await readerFor(db)({ orderId });

  const query = db.calls.find(call =>
    call.databaseName === SANDBOX &&
    call.name === "smart_shipping_v3_purchase_ownership"
  );

  assert.ok(query);
  assert.equal(query.filter.environment, "sandbox");
  assert.equal(query.filter.purchaseKey, `order:${orderId}`);
});