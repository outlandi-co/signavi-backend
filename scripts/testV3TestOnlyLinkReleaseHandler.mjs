import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3TestOnlyLinkReleaseHandler
} from "../utils/createV3TestOnlyLinkReleaseHandler.js";

const id = "507f1f77bcf86cd799439011";

const fixture = () => ({
  order: {
    _id: id,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 5528
  },
  operation: {
    _id: "507f191e810c19729de860ea",
    orderId: id,
    environment: "sandbox",
    status: "completed",
    amountCents: 5528,
    requestOwner: "server-owner",
    checkoutReferenceId: `signavi-v3-${id}`,
    idempotencyKey:
      "signavi-v3-sandbox-550e8400-e29b-41d4-a716-446655440000",
    squareCreationAttemptClaimedAt: new Date(),
    squarePaymentLinkId: "mock-link",
    squareOrderId: "mock-order",
    paymentUrl: "https://square.link/u/mock"
  },
  ownership: {
    environment: "sandbox",
    purchaseKey: `order:${id}`,
    claimedByDocumentType: "order",
    claimedByDocumentId: id
  }
});

const envNames = [
  "NODE_ENV",
  "SQUARE_ENVIRONMENT",
  "SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED",
  "SMART_SHIPPING_V3_HTTP_LINK_RELEASE_TEST_ENABLED",
  "SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED"
];

const previous = Object.fromEntries(
  envNames.map(name => [name, process.env[name]])
);

const run = async ({
  authenticated = true,
  mutate = () => {},
  linkOverride,
  orderOverride,
  failLookup = false
} = {}) => {
  const records = fixture();
  mutate(records);
  let lookups = 0;

  const handler = createV3TestOnlyLinkReleaseHandler({
    authenticateGuest: async () => authenticated,
    loadRecords: async () => records,
    expectedLocationId: "mock-location",
    readSquareLink: async () => {
      lookups++;
      if (failLookup) throw new Error("mock unavailable");
      return linkOverride ?? {
        paymentLink: {
          id: "mock-link",
          orderId: "mock-order",
          url: "https://square.link/u/mock"
        }
      };
    },
    readSquareOrder: async () => {
      lookups++;
      return orderOverride ?? {
        order: {
          id: "mock-order",
          referenceId: `signavi-v3-${id}`,
          locationId: "mock-location",
          totalMoney: { amount: 5528n, currency: "USD" }
        }
      };
    }
  });

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  await handler({ params: { orderId: id } }, res);
  return { status: res.statusCode, body: res.body, lookups };
};

try {
  Object.assign(process.env, {
    NODE_ENV: "test",
    SQUARE_ENVIRONMENT: "sandbox",
    SMART_SHIPPING_V3_CROSS_DATABASE_TEST_ENABLED: "true",
    SMART_SHIPPING_V3_HTTP_LINK_RELEASE_TEST_ENABLED: "true",
    SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "false"
  });

  test("releases independently verified recorded link", async () => {
    const result = await run();
    assert.equal(result.status, 200);
    assert.equal(result.body.paymentUrl, "https://square.link/u/mock");
    assert.equal(result.body.customerPaymentConfirmed, false);
    assert.equal(result.lookups, 2);
  });

  test("rejects unauthenticated caller before Square lookup", async () => {
    const result = await run({ authenticated: false });
    assert.equal(result.status, 403);
    assert.equal(result.body.paymentUrl, null);
    assert.equal(result.lookups, 0);
  });

  test("rejects pending operation", async () => {
    const result = await run({
      mutate: value => { value.operation.status = "pending"; }
    });
    assert.equal(result.status, 409);
    assert.equal(result.lookups, 0);
  });

  test("rejects Square order amount mismatch", async () => {
    const result = await run({
      orderOverride: {
        order: {
          id: "mock-order",
          referenceId: `signavi-v3-${id}`,
          locationId: "mock-location",
          totalMoney: { amount: 9999n, currency: "USD" }
        }
      }
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.paymentUrl, null);
  });

  test("rejects Square URL mismatch", async () => {
    const result = await run({
      linkOverride: {
        paymentLink: {
          id: "mock-link",
          orderId: "mock-order",
          url: "https://square.link/u/other"
        }
      }
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.paymentUrl, null);
  });

  test("fails closed when Square lookup fails", async () => {
    const result = await run({ failLookup: true });
    assert.equal(result.status, 503);
    assert.equal(result.body.paymentUrl, null);
  });

  test("production gate stays locked", async () => {
    process.env.NODE_ENV = "production";
    try {
      const result = await run();
      assert.equal(result.status, 423);
      assert.equal(result.lookups, 0);
    } finally {
      process.env.NODE_ENV = "test";
    }
  });
} finally {
  // Restored after test registration and execution below.
}

process.on("beforeExit", () => {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});