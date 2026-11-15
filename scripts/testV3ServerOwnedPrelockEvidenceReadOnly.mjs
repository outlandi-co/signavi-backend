import test from "node:test";
import assert from "node:assert/strict";

import {
  collectV3ServerOwnedPrelockEvidenceReadOnly as collect
} from "../utils/collectV3ServerOwnedPrelockEvidenceReadOnly.js";

const id = "507f1f77bcf86cd799439011";

const previousEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED:
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED
};

function restoreEnvironment() {
  for (const [key, value] of
    Object.entries(previousEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("missing credentials deny before database reads", async () => {
  const result = await collect({
    orderId: id,
    guestToken: "",
    signedQuote: ""
  });

  assert.equal(result.eligibleForReview, false);
  assert.equal(result.reason, "CHECKOUT_CREDENTIALS_REQUIRED");
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("invalid order identity is denied", async () => {
  const result = await collect({
    orderId: "invalid",
    guestToken: "test-token",
    signedQuote: "test-quote"
  });

  assert.equal(result.eligibleForReview, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("production environment cannot use prelock reader", async () => {
  try {
    process.env.NODE_ENV = "production";
    process.env.SQUARE_ENVIRONMENT = "production";
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED =
      "false";

    const result = await collect({
      orderId: id,
      guestToken: "test-token",
      signedQuote: "test-quote"
    });

    assert.equal(
      result.reason,
      "READ_ONLY_SANDBOX_ENVIRONMENT_REQUIRED"
    );
  } finally {
    restoreEnvironment();
  }
});

test("Square creation flag must explicitly be false", async () => {
  try {
    process.env.NODE_ENV = "test";
    process.env.SQUARE_ENVIRONMENT = "sandbox";
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED =
      "true";

    const result = await collect({
      orderId: id,
      guestToken: "test-token",
      signedQuote: "test-quote"
    });

    assert.equal(
      result.reason,
      "READ_ONLY_SANDBOX_ENVIRONMENT_REQUIRED"
    );
  } finally {
    restoreEnvironment();
  }
});

test("disconnected Store cannot provide authority", async () => {
  try {
    process.env.NODE_ENV = "test";
    process.env.SQUARE_ENVIRONMENT = "sandbox";
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED =
      "false";

    const result = await collect({
      orderId: id,
      guestToken: "test-token",
      signedQuote: "test-quote"
    });

    assert.equal(result.eligibleForReview, false);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  } finally {
    restoreEnvironment();
  }
});
