import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxHistoryInspectionGate
} from "../utils/assessV3SandboxHistoryInspectionGate.js";

const orderId = "507f1f77bcf86cd799439011";

const inspection = Object.freeze({
  orderId,
  inspected: true,
  reason: "NO_EXPLICIT_SQUARE_MATCH_OBSERVED_NOT_AUTHORIZED",
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

function locked(result) {
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(Object.isFrozen(result), true);
}

test("completed history inspection remains non-authorizing", () => {
  const result = assessV3SandboxHistoryInspectionGate({
    orderId,
    inspection
  });

  assert.equal(result.inspectionAccepted, true);
  assert.equal(
    result.reason,
    "HISTORY_OBSERVATION_ACCEPTED_NOT_AUTHORIZED"
  );
  locked(result);
});

test("missing inspection fails closed", () => {
  const result = assessV3SandboxHistoryInspectionGate({
    orderId
  });

  assert.equal(result.inspectionAccepted, false);
  locked(result);
});

test("different order identity is rejected", () => {
  const result = assessV3SandboxHistoryInspectionGate({
    orderId,
    inspection: {
      ...inspection,
      orderId: "507f1f77bcf86cd799439012"
    }
  });

  assert.equal(result.inspectionAccepted, false);
  locked(result);
});

test("claimed payment authority is rejected", () => {
  for (const flag of [
    "initializationAuthorized",
    "squareRequestAuthorized",
    "retryAuthorized",
    "authoritativeNoPriorActivity"
  ]) {
    const result = assessV3SandboxHistoryInspectionGate({
      orderId,
      inspection: {
        ...inspection,
        [flag]: true
      }
    });

    assert.equal(result.inspectionAccepted, false, flag);
    locked(result);
  }
});

test("prior activity cannot pass", () => {
  const result = assessV3SandboxHistoryInspectionGate({
    orderId,
    inspection: {
      ...inspection,
      priorActivityFound: true
    }
  });

  assert.equal(result.inspectionAccepted, false);
  locked(result);
});

test("incomplete or uncertain inspection cannot pass", () => {
  for (const change of [
    { inspected: false },
    { reason: "SQUARE_HISTORY_INSPECTION_FAILED" }
  ]) {
    const result = assessV3SandboxHistoryInspectionGate({
      orderId,
      inspection: { ...inspection, ...change }
    });

    assert.equal(result.inspectionAccepted, false);
    locked(result);
  }
});

test("invalid order identity is rejected", () => {
  const result = assessV3SandboxHistoryInspectionGate({
    orderId: "invalid",
    inspection
  });

  assert.equal(result.inspectionAccepted, false);
  locked(result);
});