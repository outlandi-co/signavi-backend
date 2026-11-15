import test from "node:test";
import assert from "node:assert/strict";

import {
  inspectV3SandboxExternalHistory
} from "../utils/inspectV3SandboxExternalHistory.js";

const orderId = "a".repeat(24);

async function withEnvironment(nodeEnv, squareEnv, run) {
  const previousNode = process.env.NODE_ENV;
  const previousSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = nodeEnv;
    process.env.SQUARE_ENVIRONMENT = squareEnv;
    return await run();
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
}

function assertLocked(result) {
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
}

test("development rejects injected Square readers", async () => {
  await withEnvironment("development", "sandbox", async () => {
    let calls = 0;

    const result = await inspectV3SandboxExternalHistory({
      orderId,
      testReaders: {
        async readPayments() {
          calls++;
          throw new Error("UNTRUSTED_PAYMENT_READER_EXECUTED");
        },
        async readOrders() {
          calls++;
          throw new Error("UNTRUSTED_ORDER_READER_EXECUTED");
        }
      }
    });

    assert.equal(result.inspected, false);
    assert.equal(result.reason, "TEST_READER_INJECTION_FORBIDDEN");
    assert.equal(calls, 0);
    assertLocked(result);
  });
});

test("production environment cannot invoke sandbox inspection", async () => {
  await withEnvironment("production", "production", async () => {
    let calls = 0;

    const result = await inspectV3SandboxExternalHistory({
      orderId,
      testReaders: {
        async readPayments() {
          calls++;
        },
        async readOrders() {
          calls++;
        }
      }
    });

    assert.equal(result.inspected, false);
    assert.equal(result.reason, "SANDBOX_TEST_INSPECTION_ONLY");
    assert.equal(calls, 0);
    assertLocked(result);
  });
});

test("malformed test readers fail closed", async () => {
  await withEnvironment("test", "sandbox", async () => {
    const result = await inspectV3SandboxExternalHistory({
      orderId,
      testReaders: {
        readPayments: async () => ({ complete: true })
      }
    });

    assert.equal(result.inspected, false);
    assert.equal(result.reason, "INVALID_TEST_READERS");
    assertLocked(result);
  });
});

test("forged payment authority in test evidence is rejected", async () => {
  await withEnvironment("test", "sandbox", async () => {
    let orderReads = 0;

    const result = await inspectV3SandboxExternalHistory({
      orderId,
      testReaders: {
        async readPayments() {
          return {
            orderId,
            environment: "sandbox",
            complete: true,
            priorActivityFound: false,
            authoritativeNoPriorActivity: true,
            squareRequestAuthorized: false,
            retryAuthorized: false
          };
        },
        async readOrders() {
          orderReads++;
          return {
            orderId,
            environment: "sandbox",
            complete: true,
            priorActivityFound: false,
            authoritativeNoPriorActivity: false,
            squareRequestAuthorized: false,
            retryAuthorized: false
          };
        }
      }
    });

    assert.equal(result.inspected, false);
    assert.equal(result.reason, "PAYMENT_HISTORY_UNSAFE_EVIDENCE");
    assert.equal(orderReads, 1);
    assertLocked(result);
  });
});

test("invalid identity rejected before injected reader execution", async () => {
  await withEnvironment("test", "sandbox", async () => {
    let calls = 0;

    const result = await inspectV3SandboxExternalHistory({
      orderId: "invalid-order-id",
      testReaders: {
        async readPayments() {
          calls++;
        },
        async readOrders() {
          calls++;
        }
      }
    });

    assert.equal(result.reason, "INVALID_ORDER_ID");
    assert.equal(result.inspected, false);
    assert.equal(calls, 0);
    assertLocked(result);
  });
});
