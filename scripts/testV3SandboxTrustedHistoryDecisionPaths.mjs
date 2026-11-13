import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  assessV3SandboxHistoryInspectionGate
} from "../utils/assessV3SandboxHistoryInspectionGate.js";

const orderId = "507f1f77bcf86cd799439011";

const original = fs.readFileSync(
  new URL("../utils/coordinateV3SandboxTrustedHistoryPreflight.js", import.meta.url),
  "utf8"
);

function createCoordinator(inspector) {
  const stripped = original
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g, "")
    .replace(
      "export async function coordinateV3SandboxTrustedHistoryPreflight",
      "async function coordinateV3SandboxTrustedHistoryPreflight"
    );

  const factory = new Function(
    "inspectV3SandboxExternalHistory",
    "assessV3SandboxHistoryInspectionGate",
    `${stripped}
return coordinateV3SandboxTrustedHistoryPreflight;`
  );

  return factory(inspector, assessV3SandboxHistoryInspectionGate);
}

function assertLocked(result) {
  assert.equal(result.ready, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(Object.isFrozen(result), true);
}

const inspected = Object.freeze({
  orderId,
  inspected: true,
  reason: "NO_EXPLICIT_SQUARE_MATCH_OBSERVED_NOT_AUTHORIZED",
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

test("completed inspection still cannot authorize initialization", async () => {
  let calls = 0;

  const coordinator = createCoordinator(async ({ orderId: requested }) => {
    calls++;
    assert.equal(requested, orderId);
    return inspected;
  });

  const result = await coordinator({ orderId });

  assert.equal(calls, 1);
  assert.equal(result.inspectionAccepted, true);
  assert.equal(result.reason, "TRUSTED_HISTORY_AUTHORITY_NOT_CONNECTED");
  assertLocked(result);
});

test("conflicting activity cannot pass preflight", async () => {
  const coordinator = createCoordinator(async () => ({
    ...inspected,
    priorActivityFound: true
  }));

  const result = await coordinator({ orderId });

  assert.equal(result.inspectionAccepted, false);
  assertLocked(result);
});

test("forged authority cannot pass preflight", async () => {
  const coordinator = createCoordinator(async () => ({
    ...inspected,
    authoritativeNoPriorActivity: true,
    squareRequestAuthorized: true
  }));

  const result = await coordinator({ orderId });

  assert.equal(result.inspectionAccepted, false);
  assertLocked(result);
});

test("reader exception fails closed", async () => {
  const coordinator = createCoordinator(async () => {
    throw new Error("SQUARE_READER_UNAVAILABLE");
  });

  const result = await coordinator({ orderId });

  assert.equal(result.reason, "SANDBOX_HISTORY_PREFLIGHT_FAILED");
  assertLocked(result);
});

test("mismatched order evidence fails closed", async () => {
  const coordinator = createCoordinator(async () => ({
    ...inspected,
    orderId: "507f1f77bcf86cd799439012"
  }));

  const result = await coordinator({ orderId });

  assert.equal(result.inspectionAccepted, false);
  assertLocked(result);
});

test("caller-provided readers are not forwarded", async () => {
  let called = false;
  let inspectedCalls = 0;

  const coordinator = createCoordinator(async input => {
    inspectedCalls++;
    assert.deepEqual(Object.keys(input), ["orderId"]);
    return inspected;
  });

  const result = await coordinator({
    orderId,
    testReaders: {
      readPayments: async () => {
        called = true;
      }
    },
    inspection: {
      authoritativeNoPriorActivity: true
    }
  });

  assert.equal(called, false);
  assert.equal(inspectedCalls, 1);
  assertLocked(result);
});