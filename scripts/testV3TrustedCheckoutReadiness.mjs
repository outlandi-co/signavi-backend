import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3TrustedCheckoutReadiness
} from "../utils/inspectV3TrustedCheckoutReadiness.js";

const id = "507f1f77bcf86cd799439011";

function harness() {
  const calls = [];

  const makeConnection = databaseName => ({
    readyState: 1,
    db: { databaseName },
    collection: name => ({
      findOne: async () => {
        calls.push(`invoice:${databaseName}:${name}`);
        return null;
      }
    })
  });

  const storefrontConnection = makeConnection("signavi_store");
  const sandboxConnection =
    makeConnection("signavi_shipping_v3_dev");

  const args = {
    orderId: id,
    storefrontConnection,
    sandboxConnection,
    verifiedShipping: {
      orderId: id,
      shippingAmountCents: 500
    },
    StorefrontOrder: {
      db: storefrontConnection,
      findById: () => ({
        lean: async () => ({
          _id: id,
          source: "store",
          status: "payment_required",
          paymentStatus: "unpaid",
          currency: "USD",
          squareExpectedAmountCents: 2500
        })
      })
    },
    SandboxOrder: {
      db: sandboxConnection,
      findById: () => ({
        lean: async () => ({
          _id: id,
          squareExpectedAmountCents: 2500,
          squareEnvironment: "sandbox"
        })
      })
    },
    SandboxPaymentOperation: {
      db: sandboxConnection,
      findOne: () => ({
        lean: async () => ({
          orderId: id,
          amountCents: 2500,
          environment: "sandbox",
          status: "pending"
        })
      })
    },
    checkPaymentHistory: async () => {
      calls.push("payment-history");
      return {
        verified: true,
        noPriorPaymentActivity: true
      };
    }
  };

  return { args, calls };
}

test("passing checks still refuse Square execution", async () => {
  const { args, calls } = harness();

  const result = await inspectV3TrustedCheckoutReadiness(args);

  assert.equal(result.ready, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(
    result.reason,
    "DURABLE_EXECUTION_BOUNDARY_REQUIRED"
  );
  assert.equal(calls.length, 5);
});

test("invoice association blocks before history check", async () => {
  const { args, calls } = harness();

  args.storefrontConnection.collection = () => ({
    findOne: async () => ({ invoiceId: "existing" })
  });

  const result = await inspectV3TrustedCheckoutReadiness(args);

  assert.equal(result.ready, false);
  assert.equal(result.reason, "INVOICE_ASSOCIATION_EXISTS");
  assert.equal(calls.includes("payment-history"), false);
});

test("historical payment evidence blocks", async () => {
  const { args } = harness();

  args.checkPaymentHistory = async () => ({
    verified: false,
    noPriorPaymentActivity: false
  });

  const result = await inspectV3TrustedCheckoutReadiness(args);

  assert.equal(result.reason, "PAYMENT_HISTORY_NOT_CLEARED");
});

test("missing history checker blocks", async () => {
  const { args } = harness();
  delete args.checkPaymentHistory;

  const result = await inspectV3TrustedCheckoutReadiness(args);

  assert.equal(result.reason, "PAYMENT_HISTORY_CHECK_REQUIRED");
});

test("history-check exception blocks", async () => {
  const { args } = harness();

  args.checkPaymentHistory = async () => {
    throw new Error("Simulated failure");
  };

  const result = await inspectV3TrustedCheckoutReadiness(args);

  assert.equal(result.reason, "PAYMENT_HISTORY_READ_UNCERTAIN");
});

test("database binding mismatch blocks", async () => {
  const { args } = harness();
  args.SandboxOrder.db = {};

  const result = await inspectV3TrustedCheckoutReadiness(args);

  assert.equal(result.reason, "AUTHORITATIVE_MODELS_NOT_VERIFIED");
});