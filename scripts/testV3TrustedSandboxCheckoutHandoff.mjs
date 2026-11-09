import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
  executeV3TrustedSandboxHandoff
} from "../utils/v3TrustedSandboxCheckoutHandoff.js";

const original = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT
};

const orderId = "507f1f77bcf86cd799439011";
const owner = "test-server-owned-lock";

async function rejectedWith(env, expected) {
  assert.equal(mongoose.connection.readyState, 0);

  process.env.NODE_ENV = env.NODE_ENV;
  process.env.SQUARE_ENVIRONMENT =
    env.SQUARE_ENVIRONMENT;

  await assert.rejects(
    executeV3TrustedSandboxHandoff({
      orderId,
      owner
    }),
    error => error?.message === expected
  );
}

try {
  test("production Node mode is blocked", async () => {
    await rejectedWith({
      NODE_ENV: "production",
      SQUARE_ENVIRONMENT: "sandbox"
    }, "V3_SANDBOX_HANDOFF_DISABLED");
  });

  test("production Square mode is blocked", async () => {
    await rejectedWith({
      NODE_ENV: "development",
      SQUARE_ENVIRONMENT: "production"
    }, "V3_SANDBOX_HANDOFF_DISABLED");
  });

  test("missing Square environment is blocked", async () => {
    await rejectedWith({
      NODE_ENV: "development",
      SQUARE_ENVIRONMENT: ""
    }, "V3_SANDBOX_HANDOFF_DISABLED");
  });

  test("disabled sandbox connection is blocked", async () => {
    const previous = process.env.SMART_SHIPPING_V3_ENABLED;
    process.env.SMART_SHIPPING_V3_ENABLED = "false";

    try {
      assert.equal(mongoose.connection.readyState, 0);

      await assert.rejects(
        executeV3TrustedSandboxHandoff({
          orderId,
          owner
        }),
        error =>
          typeof error?.message === "string" &&
          error.message.startsWith("V3_SANDBOX_")
      );
    } finally {
      if (previous === undefined) {
        delete process.env.SMART_SHIPPING_V3_ENABLED;
      } else {
        process.env.SMART_SHIPPING_V3_ENABLED = previous;
      }
    }
  });
} finally {
  // Restored after the registered tests complete below.
}

process.on("exit", () => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});