import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3VerifiedInitializationCandidate
} from "../utils/coordinateV3SandboxInitializationPreflight.js";

import {
  initializeV3SandboxDocumentsAtomic
} from "../utils/initializeV3SandboxDocumentsAtomic.js";

const orderId = "6aec6ff81538ade490af0a5b";

const evidence = {
  verified: true,
  orderId,
  amountCents: 4722,
  checkoutReferenceId: "checkout-test-reference",
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
};

const candidate = {
  eligible: true,
  orderId,
  amountCents: 4722,
  checkoutReferenceId: "checkout-test-reference",
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
};

const environmentKeys = [
  "NODE_ENV",
  "SQUARE_ENVIRONMENT",
  "SMART_SHIPPING_V3_ENABLED"
];

const original = Object.fromEntries(
  environmentKeys.map(key => [key, process.env[key]])
);

test.after(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("verified candidate does not authorize persistence", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate
  });

  assert.equal(result.ready, true);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("sandbox configuration still blocks public atomic writer", async () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
  process.env.SMART_SHIPPING_V3_ENABLED = "true";

  const result = assessV3VerifiedInitializationCandidate({
    evidence,
    candidate
  });

  assert.equal(result.ready, true);

  await assert.rejects(
    initializeV3SandboxDocumentsAtomic({
      evidence: result,
      storefrontOrder: { _id: orderId },
      storefrontOperation: { orderId }
    }),
    /V3_SANDBOX_INITIALIZATION_AUTHORIZATION_NOT_CONNECTED/
  );
});

test("production configuration blocks public atomic writer", async () => {
  process.env.NODE_ENV = "production";
  process.env.SQUARE_ENVIRONMENT = "production";
  process.env.SMART_SHIPPING_V3_ENABLED = "true";

  await assert.rejects(
    initializeV3SandboxDocumentsAtomic(),
    /V3_SANDBOX_INITIALIZATION_DISABLED/
  );
});

test("claimed initialization authority is rejected", () => {
  const result = assessV3VerifiedInitializationCandidate({
    evidence: {
      ...evidence,
      initializationAuthorized: true
    },
    candidate
  });

  assert.equal(result.ready, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
});