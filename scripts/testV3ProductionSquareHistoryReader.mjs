import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3ProductionSquareHistoryReader
} from "../utils/createV3ProductionSquareHistoryReader.js";

const saved = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SQUARE_PRODUCTION_LOCATION_ID:
    process.env.SQUARE_PRODUCTION_LOCATION_ID,
  SQUARE_PRODUCTION_ACCESS_TOKEN:
    process.env.SQUARE_PRODUCTION_ACCESS_TOKEN
};

const restore = () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

test.after(restore);

const fakeClient = data => ({
  checkout: {
    paymentLinks: {
      list() {
        return {
          async withRawResponse() {
            return { data };
          }
        };
      },
      create() {
        throw new Error("PAYMENT_CREATION_FORBIDDEN");
      }
    }
  }
});

test("read-only history collection never authorizes payment", async () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_PRODUCTION_LOCATION_ID = "test_location";

  const reader = createV3ProductionSquareHistoryReader({
    testClient: fakeClient({
      paymentLinks: [{ id: "link_1", orderId: "square_1" }]
    })
  });

  const result = await reader.collectHistory();

  assert.equal(result.complete, true);
  assert.equal(result.links.length, 1);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
});

test("empty history still cannot authorize Square", async () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_PRODUCTION_LOCATION_ID = "test_location";

  const reader = createV3ProductionSquareHistoryReader({
    testClient: fakeClient({ paymentLinks: [] })
  });

  const result = await reader.collectHistory();

  assert.equal(result.complete, true);
  assert.equal(result.links.length, 0);
  assert.equal(result.authoritativeNoPriorActivity, false);
  assert.equal(result.squareRequestAuthorized, false);
});

test("test-client injection is rejected outside test mode", () => {
  process.env.NODE_ENV = "production";
  process.env.SQUARE_PRODUCTION_LOCATION_ID = "test_location";

  assert.throws(
    () => createV3ProductionSquareHistoryReader({
      testClient: fakeClient({ paymentLinks: [] })
    }),
    /SQUARE_TEST_CLIENT_FORBIDDEN/
  );
});

test("production client requires production environment", () => {
  process.env.NODE_ENV = "production";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
  process.env.SQUARE_PRODUCTION_LOCATION_ID = "test_location";

  assert.throws(
    () => createV3ProductionSquareHistoryReader(),
    /PRODUCTION_SQUARE_ENVIRONMENT_REQUIRED/
  );
});

test("production client requires server-owned credentials", () => {
  process.env.NODE_ENV = "production";
  process.env.SQUARE_ENVIRONMENT = "production";
  process.env.SQUARE_PRODUCTION_LOCATION_ID = "test_location";
  delete process.env.SQUARE_PRODUCTION_ACCESS_TOKEN;

  assert.throws(
    () => createV3ProductionSquareHistoryReader(),
    /PRODUCTION_SQUARE_TOKEN_REQUIRED/
  );
});

test("invalid Square listing client is rejected", () => {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_PRODUCTION_LOCATION_ID = "test_location";

  assert.throws(
    () => createV3ProductionSquareHistoryReader({
      testClient: { checkout: { paymentLinks: {} } }
    }),
    /SQUARE_LIST_CLIENT_UNAVAILABLE/
  );
});