import test from "node:test";
import assert from "node:assert/strict";

import {
  initializeV3SandboxDocumentsAtomic
} from "../utils/initializeV3SandboxDocumentsAtomic.js";

test("production configuration cannot initialize", async () => {
  process.env.NODE_ENV = "production";
  process.env.SQUARE_ENVIRONMENT = "production";
  process.env.SMART_SHIPPING_V3_ENABLED = "true";

  await assert.rejects(
    initializeV3SandboxDocumentsAtomic(),
    /V3_SANDBOX_INITIALIZATION_DISABLED/
  );
});

test("development sandbox remains unauthorized", async () => {
  process.env.NODE_ENV = "development";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
  process.env.SMART_SHIPPING_V3_ENABLED = "true";

  await assert.rejects(
    initializeV3SandboxDocumentsAtomic(),
    /V3_SANDBOX_INITIALIZATION_AUTHORIZATION_NOT_CONNECTED/
  );
});

test("disabled V3 feature cannot initialize", async () => {
  process.env.NODE_ENV = "development";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
  process.env.SMART_SHIPPING_V3_ENABLED = "false";

  await assert.rejects(
    initializeV3SandboxDocumentsAtomic(),
    /V3_SANDBOX_INITIALIZATION_DISABLED/
  );
});