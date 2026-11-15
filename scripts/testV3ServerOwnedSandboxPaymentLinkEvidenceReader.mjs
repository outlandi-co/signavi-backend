import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ServerOwnedSandboxPaymentLinkEvidenceReader
} from "../utils/createV3ServerOwnedSandboxPaymentLinkEvidenceReader.js";

const orderId = "507f1f77bcf86cd799439011";

function mockClient({
  list = async () => {
    throw new Error("Simulated Square read failure");
  }
} = {}) {
  return {
    checkout: {
      paymentLinks: { list }
    },
    orders: {
      async get() {
        throw new Error("Unexpected Square order lookup");
      }
    }
  };
}

test("sandbox SDK reader is constructed with mock transport", () => {
  const reader =
    createV3ServerOwnedSandboxPaymentLinkEvidenceReader({
      testClient: mockClient()
    });

  assert.equal(typeof reader, "function");
});

test("invalid order identity cannot call Square", async () => {
  let calls = 0;

  const reader =
    createV3ServerOwnedSandboxPaymentLinkEvidenceReader({
      testClient: mockClient({
        async list() {
          calls++;
          throw new Error("Should never execute");
        }
      })
    });

  const result = await reader({
    orderId: "invalid-order"
  });

  assert.equal(calls, 0);
  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("Square SDK read failures cannot establish absence", async () => {
  let calls = 0;

  const reader =
    createV3ServerOwnedSandboxPaymentLinkEvidenceReader({
      testClient: mockClient({
        async list() {
          calls++;
          throw new Error("Simulated SDK failure");
        }
      })
    });

  const result = await reader({ orderId });

  assert.ok(calls >= 1);
  assert.equal(result.complete, false);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("invalid SDK dependencies fail closed", () => {
  assert.throws(
    () => createV3ServerOwnedSandboxPaymentLinkEvidenceReader({
      testClient: {
        checkout: { paymentLinks: {} },
        orders: {}
      }
    }),
    { message: "V3_SQUARE_READ_CLIENT_INVALID" }
  );
});

test("production environment rejects the reader", () => {
  const savedNode = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";

    assert.throws(
      () => createV3ServerOwnedSandboxPaymentLinkEvidenceReader(),
      { message: "V3_SANDBOX_PAYMENT_LINK_REVIEW_DISABLED" }
    );
  } finally {
    if (savedNode === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNode;
    }
  }
});

test("test client injection is rejected outside test mode", () => {
  const savedNode = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "development";

    assert.throws(
      () => createV3ServerOwnedSandboxPaymentLinkEvidenceReader({
        testClient: mockClient()
      }),
      { message: "V3_EXTERNAL_SQUARE_CLIENT_FORBIDDEN" }
    );
  } finally {
    if (savedNode === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNode;
    }
  }
});
