import test from "node:test";
import assert from "node:assert/strict";

import {
  checkV3CrossDatabaseInvoiceAssociations as check
} from "../utils/checkV3CrossDatabaseInvoiceAssociations.js";

const orderId = "507f1f77bcf86cd799439011";

function harness() {
  const reads = [];

  const makeConnection = (name, result = null) => ({
    readyState: 1,
    db: { databaseName: name },
    collection(collectionName) {
      assert.ok([
        "invoice_order_associations_v3_test",
        "smart_shipping_v3_invoice_order_associations"
      ].includes(collectionName));

      return {
        async findOne(filter) {
          assert.equal(String(filter.orderId), orderId);
          reads.push(name);
          return result;
        }
      };
    }
  });

  return {
    reads,
    args: {
      orderId,
      storefrontConnection: makeConnection("signavi_store"),
      sandboxConnection: makeConnection("signavi_shipping_v3_dev")
    }
  };
}

test("both checked collections clear, still no Square permission", async () => {
  const { args, reads } = harness();
  const result = await check(args);

  assert.equal(result.clear, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.deepEqual(reads, [
    "signavi_store",
    "signavi_store",
    "signavi_shipping_v3_dev",
    "signavi_shipping_v3_dev"
  ]);
});

test("storefront association blocks", async () => {
  const { args } = harness();
  args.storefrontConnection.collection = () => ({
    findOne: async () => ({ invoiceId: "existing" })
  });

  assert.equal((await check(args)).clear, false);
});

test("sandbox association blocks", async () => {
  const { args } = harness();
  args.sandboxConnection.collection = () => ({
    findOne: async () => ({ invoiceId: "existing" })
  });

  assert.equal((await check(args)).clear, false);
});

test("incorrect database blocks", async () => {
  const { args } = harness();
  args.storefrontConnection.db.databaseName = "unexpected";

  assert.equal((await check(args)).clear, false);
});

test("database read error blocks", async () => {
  const { args } = harness();
  args.storefrontConnection.collection = () => {
    throw new Error("Simulated read failure");
  };

  assert.equal(
    (await check(args)).reason,
    "INVOICE_ASSOCIATION_READ_UNCERTAIN"
  );
});

test("invalid order identity blocks", async () => {
  const { args } = harness();
  args.orderId = "invalid";

  assert.equal((await check(args)).clear, false);
});

test("durable storefront association blocks", async () => {
  const { args } = harness();
  const originalCollection = args.storefrontConnection.collection;

  args.storefrontConnection.collection = name => {
    if (name === "smart_shipping_v3_invoice_order_associations") {
      return {
        findOne: async () => ({ invoiceId: "durable-existing" })
      };
    }
    return originalCollection(name);
  };

  const result = await check(args);
  assert.equal(result.clear, false);
  assert.equal(result.reason, "INVOICE_ASSOCIATION_EXISTS");
  assert.equal(result.squareRequestAuthorized, false);
});

test("durable sandbox association blocks", async () => {
  const { args } = harness();
  const originalCollection = args.sandboxConnection.collection;

  args.sandboxConnection.collection = name => {
    if (name === "smart_shipping_v3_invoice_order_associations") {
      return {
        findOne: async () => ({ invoiceId: "durable-existing" })
      };
    }
    return originalCollection(name);
  };

  const result = await check(args);
  assert.equal(result.clear, false);
  assert.equal(result.reason, "INVOICE_ASSOCIATION_EXISTS");
  assert.equal(result.squareRequestAuthorized, false);
});

test("durable collection read failure blocks", async () => {
  const { args } = harness();
  const originalCollection = args.storefrontConnection.collection;

  args.storefrontConnection.collection = name => {
    if (name === "smart_shipping_v3_invoice_order_associations") {
      throw new Error("Simulated durable collection failure");
    }
    return originalCollection(name);
  };

  const result = await check(args);
  assert.equal(result.clear, false);
  assert.equal(result.reason, "INVOICE_ASSOCIATION_READ_UNCERTAIN");
});