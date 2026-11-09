import test from "node:test";
import assert from "node:assert/strict";

import {
  verifyV3SandboxInitializationEvidence
} from "../utils/verifyV3SandboxInitializationEvidence.js";

const original = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SMART_SHIPPING_V3_ENABLED:
    process.env.SMART_SHIPPING_V3_ENABLED
};

const restore = () => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

try {
  test("production rejects initialization", async () => {
    process.env.NODE_ENV = "production";
    process.env.SQUARE_ENVIRONMENT = "production";
    process.env.SMART_SHIPPING_V3_ENABLED = "true";

    const result = await verifyV3SandboxInitializationEvidence();

    assert.equal(result.verified, false);
    assert.equal(result.reason, "SANDBOX_ENVIRONMENT_REQUIRED");
    assert.equal(result.initializationAuthorized, false);
    assert.equal(result.squareRequestAuthorized, false);
  });

  test("missing credentials reject initialization", async () => {
    process.env.NODE_ENV = "development";
    process.env.SQUARE_ENVIRONMENT = "sandbox";
    process.env.SMART_SHIPPING_V3_ENABLED = "true";

    const result = await verifyV3SandboxInitializationEvidence();

    assert.equal(result.verified, false);
    assert.equal(
      result.reason,
      "CHECKOUT_CREDENTIALS_OR_RECORDS_MISSING"
    );
    assert.equal(result.initializationAuthorized, false);
    assert.equal(result.squareRequestAuthorized, false);
  });

  test("invalid database boundary blocks payment history callback", async () => {
    process.env.NODE_ENV = "development";
    process.env.SQUARE_ENVIRONMENT = "sandbox";
    process.env.SMART_SHIPPING_V3_ENABLED = "true";

    let historyCalled = false;

    const result = await verifyV3SandboxInitializationEvidence({
      storefrontOrder: { _id: "6aec6ff81538ade490af0a5b" },
      storefrontOperation: { status: "pending" },
      guestToken: "test-only-token",
      signedQuote: "test-only-quote",
      storefrontConnection: {},
      sandboxConnection: {},
      checkPaymentHistory: async () => {
        historyCalled = true;
        return {
          verified: true,
          noPriorPaymentActivity: true
        };
      }
    });

    assert.equal(result.verified, false);
    assert.equal(result.reason, "DATABASE_ISOLATION_REQUIRED");
    assert.equal(historyCalled, false);
    assert.equal(result.squareRequestAuthorized, false);
  });

  test("V3 feature disabled rejects initialization", async () => {
    process.env.NODE_ENV = "development";
    process.env.SQUARE_ENVIRONMENT = "sandbox";
    process.env.SMART_SHIPPING_V3_ENABLED = "false";

    const result = await verifyV3SandboxInitializationEvidence();

    assert.equal(result.verified, false);
    assert.equal(result.initializationAuthorized, false);
    assert.equal(result.squareRequestAuthorized, false);
  });
} finally {
  restore();
}