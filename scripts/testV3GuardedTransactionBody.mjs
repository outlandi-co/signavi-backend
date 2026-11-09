
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  initializeV3SandboxDocumentsAtomic
} from "../utils/initializeV3SandboxDocumentsAtomic.js";

const source = fs.readFileSync(
  new URL("../utils/initializeV3SandboxDocumentsAtomic.js", import.meta.url),
  "utf8"
);

test("public entry point remains blocked under sandbox configuration", async () => {
  const keys = [
    "NODE_ENV",
    "SQUARE_ENVIRONMENT",
    "SMART_SHIPPING_V3_ENABLED"
  ];

  const old = Object.fromEntries(
    keys.map(key => [key, process.env[key]])
  );

  try {
    process.env.NODE_ENV = "test";
    process.env.SQUARE_ENVIRONMENT = "sandbox";
    process.env.SMART_SHIPPING_V3_ENABLED = "true";

    await assert.rejects(
      initializeV3SandboxDocumentsAtomic(),
      /V3_SANDBOX_INITIALIZATION_AUTHORIZATION_NOT_CONNECTED/
    );
  } finally {
    for (const key of keys) {
      if (old[key] === undefined) delete process.env[key];
      else process.env[key] = old[key];
    }
  }
});

test("private transaction has mandatory rejection before opening session", () => {
  const rejection = source.indexOf(
    'throw new Error(\n    "V3_SANDBOX_TRUSTED_PAYMENT_HISTORY_NOT_CONNECTED"'
  );

  const session = source.indexOf(
    "const session = await storefrontConnection.startSession()"
  );

  const publicEntry = source.indexOf(
    "export async function initializeV3SandboxDocumentsAtomic()"
  );

  assert.ok(rejection >= 0);
  assert.ok(session > rejection);
  assert.ok(publicEntry > session);
});

test("staged transaction uses fresh state and a shared session", () => {
  for (const required of [
    "const freshOrder = await storefrontOrders.findOne(",
    "const freshOperation = await storefrontOperations.findOne(",
    "buildV3SandboxInitializationDocuments({",
    "storefrontOrders.updateOne(",
    "claim.filter,",
    "claim.update,",
    "models.Order.create(",
    "models.PaymentOperation.create(",
    "await session.endSession()"
  ]) {
    assert.ok(source.includes(required), required);
  }
});

test("staged transaction does not invoke a Square payment operation", () => {
  assert.equal(
    /squareClient\.paymentLinks\.create|squareClient\.payments\.create/.test(source),
    false
  );
});
