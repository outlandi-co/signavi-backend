import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxOrderHistoryReader
} from "../utils/createV3SandboxOrderHistoryReader.js";

const orderId = "507f1f77bcf86cd799439011";

const setup = search =>
  createV3SandboxOrderHistoryReader({
    testClient: { orders: { search } }
  });

test("searches orders without excluding open states", async () => {
  const requests = [];

  const reader = setup(async (request, options) => {
    requests.push({ request, options });
    return { orders: [] };
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, true);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(requests.length, 1);
  assert.deepEqual(
    requests[0].request.locationIds,
    ["sandbox_test_location"]
  );
  assert.equal(requests[0].request.limit, 1000);
  assert.equal(requests[0].request.returnEntries, false);
  assert.equal(requests[0].request.query, undefined);
  assert.equal(requests[0].options.maxRetries, 0);
});

test("detects existing open Square order", async () => {
  const reader = setup(async () => ({
    orders: [{
      id: "square_open_1",
      state: "OPEN",
      referenceId: `signavi-v3-sandbox-${orderId}`
    }]
  }));

  const result = await reader({ orderId });

  assert.equal(result.priorActivityFound, true);
  assert.equal(result.squareRequestAuthorized, false);
});

test("uses pagination cursor to inspect later orders", async () => {
  const requests = [];

  const reader = setup(async request => {
    requests.push(request);

    return request.cursor
      ? {
          orders: [{
            id: "square_later",
            note: `ID:${orderId}`
          }]
        }
      : {
          orders: [{
            id: "square_first",
            referenceId: "other_purchase"
          }],
          cursor: "page_2"
        };
  });

  const result = await reader({ orderId });

  assert.equal(requests.length, 2);
  assert.equal(requests[1].cursor, "page_2");
  assert.equal(result.priorActivityFound, true);
});

test("SDK errors fail closed", async () => {
  const reader = setup(async () => {
    throw new Error("Simulated Square outage");
  });

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("malformed search response fails closed", async () => {
  const reader = setup(async () => ({
    orders: null
  }));

  const result = await reader({ orderId });

  assert.equal(result.complete, false);
  assert.equal(
    result.reason,
    "SQUARE_ORDER_SEARCH_FAILED"
  );
});

test("production environment is rejected", () => {
  const previous = process.env.SQUARE_ENVIRONMENT;

  try {
    process.env.SQUARE_ENVIRONMENT = "production";

    assert.throws(
      () => setup(async () => ({ orders: [] })),
      /SANDBOX_SQUARE_ENVIRONMENT_REQUIRED/
    );
  } finally {
    process.env.SQUARE_ENVIRONMENT = previous;
  }
});