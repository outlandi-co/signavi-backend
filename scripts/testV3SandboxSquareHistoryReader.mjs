import test from "node:test";
import assert from "node:assert/strict";

import {
  createV3SandboxSquareHistoryReader
} from "../utils/createV3SandboxSquareHistoryReader.js";

const original = {
  NODE_ENV: process.env.NODE_ENV,
  SQUARE_ENVIRONMENT: process.env.SQUARE_ENVIRONMENT,
  SMART_SHIPPING_V3_ENABLED: process.env.SMART_SHIPPING_V3_ENABLED,
  SQUARE_SANDBOX_LOCATION_ID: process.env.SQUARE_SANDBOX_LOCATION_ID
};

function configureSandbox() {
  process.env.NODE_ENV = "test";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
  process.env.SMART_SHIPPING_V3_ENABLED = "true";
  process.env.SQUARE_SANDBOX_LOCATION_ID = "TEST_LOCATION";
}

function mockClient(pages) {
  let index = 0;

  return {
    checkout: {
      paymentLinks: {
        list() {
          const data = pages[index++];

          return {
            async withRawResponse() {
              if (!data) {
                throw new Error("Unexpected history page request");
              }

              return { data };
            }
          };
        }
      }
    }
  };
}

try {
  test("reads a complete empty Sandbox history", async () => {
    configureSandbox();

    const reader = createV3SandboxSquareHistoryReader({
      testClient: mockClient([
        { paymentLinks: [], cursor: null }
      ])
    });

    const result = await reader.collectHistory();

    assert.equal(result.complete, true);
    assert.deepEqual(result.links, []);
    assert.equal(result.authoritativeNoPriorActivity, false);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  });

  test("preserves discovered payment links", async () => {
    configureSandbox();

    const reader = createV3SandboxSquareHistoryReader({
      testClient: mockClient([
        {
          paymentLinks: [
            {
              id: "sandbox-link-1",
              orderId: "sandbox-square-order-1",
              paymentNote: "Sandbox test"
            }
          ],
          cursor: null
        }
      ])
    });

    const result = await reader.collectHistory();

    assert.equal(result.complete, true);
    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].id, "sandbox-link-1");
    assert.equal(result.squareRequestAuthorized, false);
  });

  test("incomplete pagination cannot authorize payment", async () => {
    configureSandbox();

    const reader = createV3SandboxSquareHistoryReader({
      testClient: mockClient([
        { paymentLinks: [], cursor: "another-page" }
      ])
    });

    const result = await reader.collectHistory({
      maxPages: 1
    });

    assert.equal(result.complete, false);
    assert.equal(result.authoritativeNoPriorActivity, false);
    assert.equal(result.squareRequestAuthorized, false);
    assert.equal(result.retryAuthorized, false);
  });

  test("production environment rejects Sandbox history reader", () => {
    configureSandbox();
    process.env.SQUARE_ENVIRONMENT = "production";

    assert.throws(
      () => createV3SandboxSquareHistoryReader({
        testClient: mockClient([])
      }),
      /SANDBOX_SQUARE_HISTORY_DISABLED/
    );
  });

  test("external test client is forbidden in development", () => {
    configureSandbox();
    process.env.NODE_ENV = "development";

    assert.throws(
      () => createV3SandboxSquareHistoryReader({
        testClient: mockClient([])
      }),
      /SQUARE_TEST_CLIENT_FORBIDDEN/
    );
  });
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}