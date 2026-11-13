import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SandboxExternalHistory
} from "../utils/inspectV3SandboxExternalHistory.js";

import {
  assessV3SandboxHistoryInspectionGate
} from "../utils/assessV3SandboxHistoryInspectionGate.js";

const orderId = "507f1f77bcf86cd799439011";

function assertLocked(result) {
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

async function inspectWithReaders(readers) {
  const inspection = await inspectV3SandboxExternalHistory({
    orderId,
    testReaders: readers
  });

  const gate = assessV3SandboxHistoryInspectionGate({
    orderId,
    inspection
  });

  return { inspection, gate };
}

test("test-reader inspection remains observation only", async () => {
  const { inspection, gate } = await inspectWithReaders({
    readPayments: async () => ({
      complete: true,
      priorActivityFound: false,
      authoritativeNoPriorActivity: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    }),
    readOrders: async () => ({
      complete: true,
      priorActivityFound: false,
      authoritativeNoPriorActivity: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  });

  assert.equal(inspection.authoritativeNoPriorActivity, false);
  assertLocked(inspection);
  assertLocked(gate);

  if (inspection.inspected === true) {
    assert.equal(gate.inspectionAccepted, true);
  } else {
    assert.equal(gate.inspectionAccepted, false);
  }
});

test("uncertain payment history fails closed", async () => {
  const { gate } = await inspectWithReaders({
    readPayments: async () => ({
      complete: false,
      priorActivityFound: false
    }),
    readOrders: async () => {
      throw new Error("Order reader should not execute");
    }
  });

  assert.equal(gate.inspectionAccepted, false);
  assertLocked(gate);
});

test("payment reader failure cannot authorize checkout", async () => {
  const { gate } = await inspectWithReaders({
    readPayments: async () => {
      throw new Error("Square unavailable");
    },
    readOrders: async () => ({
      complete: true,
      priorActivityFound: false
    })
  });

  assert.equal(gate.inspectionAccepted, false);
  assertLocked(gate);
});

test("production environment cannot use test readers", async () => {
  const previousNode = process.env.NODE_ENV;
  const previousSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "production";
    process.env.SQUARE_ENVIRONMENT = "production";

    const { gate } = await inspectWithReaders({
      readPayments: async () => ({
        complete: true,
        priorActivityFound: false
      }),
      readOrders: async () => ({
        complete: true,
        priorActivityFound: false
      })
    });

    assert.equal(gate.inspectionAccepted, false);
    assertLocked(gate);
  } finally {
    if (previousNode === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNode;
    }

    if (previousSquare === undefined) {
      delete process.env.SQUARE_ENVIRONMENT;
    } else {
      process.env.SQUARE_ENVIRONMENT = previousSquare;
    }
  }
});