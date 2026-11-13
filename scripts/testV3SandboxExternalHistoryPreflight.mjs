import test from "node:test";
import assert from "node:assert/strict";

import {
  assessV3SandboxExternalHistory,
  inspectV3SandboxExternalHistory
} from "../utils/inspectV3SandboxExternalHistory.js";

const id = "507f1f77bcf86cd799439011";

const evidence = () => ({
  orderId: id,
  environment: "sandbox",
  complete: true,
  priorActivityFound: false,
  authoritativeNoPriorActivity: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

function blocked(result) {
  assert.equal(result.initializationAuthorized, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(Object.isFrozen(result), true);
}

test("invalid order ID fails closed", () => {
  const result = assessV3SandboxExternalHistory({
    orderId: "invalid"
  });

  blocked(result);
  assert.equal(result.inspected, false);
});

test("clean history does not authorize payment", () => {
  const result = assessV3SandboxExternalHistory({
    orderId: id,
    paymentEvidence: evidence(),
    orderEvidence: evidence()
  });

  blocked(result);
  assert.equal(result.inspected, true);
});

test("prior payment blocks", () => {
  const result = assessV3SandboxExternalHistory({
    orderId: id,
    paymentEvidence: {
      ...evidence(),
      priorActivityFound: true
    },
    orderEvidence: evidence()
  });

  blocked(result);
  assert.match(result.reason, /PAYMENT_HISTORY_PRIOR_ACTIVITY/);
});

test("prior order blocks", () => {
  const result = assessV3SandboxExternalHistory({
    orderId: id,
    paymentEvidence: evidence(),
    orderEvidence: {
      ...evidence(),
      priorActivityFound: true
    }
  });

  blocked(result);
  assert.match(result.reason, /ORDER_HISTORY_PRIOR_ACTIVITY/);
});

test("incomplete evidence blocks", () => {
  for (const orderEvidence of [
    null,
    { ...evidence(), complete: false },
    { ...evidence(), environment: "production" },
    { ...evidence(), orderId: "507f1f77bcf86cd799439012" }
  ]) {
    blocked(assessV3SandboxExternalHistory({
      orderId: id,
      paymentEvidence: evidence(),
      orderEvidence
    }));
  }
});

test("unsafe authorization flags block", () => {
  blocked(assessV3SandboxExternalHistory({
    orderId: id,
    paymentEvidence: {
      ...evidence(),
      squareRequestAuthorized: true
    },
    orderEvidence: evidence()
  }));
});

test("production inspection blocks", async () => {
  const previous = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";

    const result = await inspectV3SandboxExternalHistory({
      orderId: id,
      testReaders: {
        readPayments: async () => evidence(),
        readOrders: async () => evidence()
      }
    });

    blocked(result);
    assert.equal(result.inspected, false);
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
});

test("mock readers observe without authorizing", async () => {
  const previousNode = process.env.NODE_ENV;
  const previousSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "test";
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    const result = await inspectV3SandboxExternalHistory({
      orderId: id,
      testReaders: {
        readPayments: async () => evidence(),
        readOrders: async () => evidence()
      }
    });

    blocked(result);
    assert.equal(result.inspected, true);
  } finally {
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;

    if (previousSquare === undefined) delete process.env.SQUARE_ENVIRONMENT;
    else process.env.SQUARE_ENVIRONMENT = previousSquare;
  }
});

test("reader failure blocks", async () => {
  const previousNode = process.env.NODE_ENV;
  const previousSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "test";
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    const result = await inspectV3SandboxExternalHistory({
      orderId: id,
      testReaders: {
        readPayments: async () => {
          throw Error("Simulated failure");
        },
        readOrders: async () => evidence()
      }
    });

    blocked(result);
    assert.equal(
      result.reason,
      "SQUARE_HISTORY_INSPECTION_FAILED"
    );
  } finally {
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;

    if (previousSquare === undefined) delete process.env.SQUARE_ENVIRONMENT;
    else process.env.SQUARE_ENVIRONMENT = previousSquare;
  }
});

test("development rejects injected readers", async () => {
  const previousNode = process.env.NODE_ENV;
  const previousSquare = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.NODE_ENV = "development";
    process.env.SQUARE_ENVIRONMENT = "sandbox";

    const result = await inspectV3SandboxExternalHistory({
      orderId: id,
      testReaders: {
        readPayments: async () => evidence(),
        readOrders: async () => evidence()
      }
    });

    blocked(result);
    assert.equal(
      result.reason,
      "TEST_READER_INJECTION_FORBIDDEN"
    );
  } finally {
    if (previousNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNode;

    if (previousSquare === undefined) delete process.env.SQUARE_ENVIRONMENT;
    else process.env.SQUARE_ENVIRONMENT = previousSquare;
  }
});