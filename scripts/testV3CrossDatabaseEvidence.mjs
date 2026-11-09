import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3CrossDatabaseEvidence
} from "../utils/inspectV3CrossDatabaseEvidence.js";

const id = "507f1f77bcf86cd799439011";

function harness() {
  const storefrontConnection = {
    readyState: 1,
    db: { databaseName: "signavi_store" }
  };

  const sandboxConnection = {
    readyState: 1,
    db: { databaseName: "signavi_shipping_v3_dev" }
  };

  const storefrontOrder = {
    _id: id,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "USD",
    squareExpectedAmountCents: 2500
  };

  const sandboxOrder = {
    _id: id,
    squareExpectedAmountCents: 2500,
    squareEnvironment: "sandbox"
  };

  const sandboxOperation = {
    orderId: id,
    amountCents: 2500,
    environment: "sandbox",
    status: "pending"
  };

  const args = {
    orderId: id,
    storefrontConnection,
    sandboxConnection,
    StorefrontOrder: {
      db: storefrontConnection,
      findById: () => ({
        lean: async () => storefrontOrder
      })
    },
    SandboxOrder: {
      db: sandboxConnection,
      findById: () => ({
        lean: async () => sandboxOrder
      })
    },
    SandboxPaymentOperation: {
      db: sandboxConnection,
      findOne: () => ({
        lean: async () => sandboxOperation
      })
    },
    verifiedShipping: {
      orderId: id,
      shippingAmountCents: 500
    }
  };

  return {
    args,
    storefrontOrder,
    sandboxOrder,
    sandboxOperation
  };
}

test("authoritative records remain payment-locked", async () => {
  const { args } = harness();
  const result = await inspectV3CrossDatabaseEvidence(args);

  assert.equal(result.verified, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("incorrect storefront database is blocked", async () => {
  const { args } = harness();
  args.storefrontConnection.db.databaseName = "wrong";

  assert.equal(
    (await inspectV3CrossDatabaseEvidence(args)).verified,
    false
  );
});

test("unbound model is blocked", async () => {
  const { args } = harness();
  args.SandboxOrder.db = {};

  assert.equal(
    (await inspectV3CrossDatabaseEvidence(args)).verified,
    false
  );
});

test("missing storefront order is blocked", async () => {
  const { args } = harness();
  args.StorefrontOrder.findById = () => ({
    lean: async () => null
  });

  assert.equal(
    (await inspectV3CrossDatabaseEvidence(args)).verified,
    false
  );
});

test("mismatched amounts are blocked", async () => {
  const { args, sandboxOperation } = harness();
  sandboxOperation.amountCents = 2600;

  assert.equal(
    (await inspectV3CrossDatabaseEvidence(args)).verified,
    false
  );
});

test("database query failure is blocked", async () => {
  const { args } = harness();
  args.StorefrontOrder.findById = () => {
    throw new Error("simulated database failure");
  };

  assert.equal(
    (await inspectV3CrossDatabaseEvidence(args)).reason,
    "CROSS_DATABASE_EVIDENCE_READ_UNCERTAIN"
  );
});