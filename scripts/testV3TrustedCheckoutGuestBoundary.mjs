import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  executeV3TrustedSandboxCheckout
} from "../utils/v3TrustedSandboxCheckoutHandoff.js";

const orderId = "507f1f77bcf86cd799439011";

test("missing guest credentials block before database access", async () => {
  assert.equal(mongoose.connection.readyState, 0);

  await assert.rejects(
    executeV3TrustedSandboxCheckout({ orderId }),
    { message: "V3_SANDBOX_CHECKOUT_CREDENTIALS_REQUIRED" }
  );
});

test("missing signed quote blocks before database access", async () => {
  assert.equal(mongoose.connection.readyState, 0);

  await assert.rejects(
    executeV3TrustedSandboxCheckout({
      orderId,
      guestToken: "synthetic-test-token"
    }),
    { message: "V3_SANDBOX_CHECKOUT_CREDENTIALS_REQUIRED" }
  );
});

test("invalid order identity blocks before database access", async () => {
  await assert.rejects(
    executeV3TrustedSandboxCheckout({
      orderId: "invalid",
      guestToken: "synthetic-test-token",
      signedQuote: "synthetic-test-quote"
    }),
    { message: "V3_SANDBOX_CHECKOUT_INVALID_ORDER" }
  );
});

test("disconnected storefront cannot authorize checkout", async () => {
  assert.equal(mongoose.connection.readyState, 0);

  await assert.rejects(
    executeV3TrustedSandboxCheckout({
      orderId,
      guestToken: "synthetic-test-token",
      signedQuote: "synthetic-test-quote"
    }),
    { message: "V3_STOREFRONT_AUTHORITY_REQUIRED" }
  );
});