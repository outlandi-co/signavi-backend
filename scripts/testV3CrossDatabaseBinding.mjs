import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyV3CrossDatabaseBinding
} from "../utils/verifyV3CrossDatabaseBinding.js";

const id = "507f1f77bcf86cd799439011";

function evidence() {
  return {
    storefrontDatabase: "signavi_store",
    sandboxDatabase: "signavi_shipping_v3_dev",
    storefrontOrder: {
      _id: id,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      currency: "USD",
      squareExpectedAmountCents: 2500
    },
    sandboxOrder: {
      _id: id,
      squareExpectedAmountCents: 2500,
      squareEnvironment: "sandbox"
    },
    sandboxOperation: {
      orderId: id,
      amountCents: 2500,
      environment: "sandbox",
      status: "pending"
    },
    verifiedShipping: {
      orderId: id,
      shippingAmountCents: 500
    }
  };
}

test("consistent records never authorize Square", () => {
  const result = verifyV3CrossDatabaseBinding(evidence());

  assert.equal(result.verified, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("wrong storefront database is blocked", () => {
  const input = evidence();
  input.storefrontDatabase = "signavi_shipping_v3_dev";

  assert.equal(
    verifyV3CrossDatabaseBinding(input).verified,
    false
  );
});

test("different order identity is blocked", () => {
  const input = evidence();
  input.sandboxOrder._id = "507f1f77bcf86cd799439012";

  assert.equal(
    verifyV3CrossDatabaseBinding(input).verified,
    false
  );
});

test("different payment amount is blocked", () => {
  const input = evidence();
  input.sandboxOperation.amountCents = 2600;

  assert.equal(
    verifyV3CrossDatabaseBinding(input).verified,
    false
  );
});

test("paid storefront order is blocked", () => {
  const input = evidence();
  input.storefrontOrder.paymentStatus = "paid";

  assert.equal(
    verifyV3CrossDatabaseBinding(input).verified,
    false
  );
});

test("existing payment link is blocked", () => {
  const input = evidence();
  input.storefrontOrder.squarePaymentLinkId = "existing";

  assert.equal(
    verifyV3CrossDatabaseBinding(input).verified,
    false
  );
});

test("claimed sandbox payment is blocked", () => {
  const input = evidence();
  input.sandboxOperation.requestOwner = "another-worker";

  assert.equal(
    verifyV3CrossDatabaseBinding(input).verified,
    false
  );
});

test("missing shipping verification is blocked", () => {
  const input = evidence();
  input.verifiedShipping = null;

  assert.equal(
    verifyV3CrossDatabaseBinding(input).verified,
    false
  );
});