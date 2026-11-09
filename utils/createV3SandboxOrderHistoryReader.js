import { SquareClient, SquareEnvironment } from "square";

import {
  collectV3SandboxOrderRecordEvidence
} from "./collectV3SandboxOrderRecordEvidence.js";

/**
 * Server-owned, read-only Sandbox order history.
 * Test-client injection is restricted to NODE_ENV=test.
 * Never authorizes creation, initialization, or retries.
 */
export function createV3SandboxOrderHistoryReader({
  testClient
} = {}) {
  const testMode = process.env.NODE_ENV === "test";

  if (testClient !== undefined && !testMode) {
    throw new Error("SQUARE_TEST_CLIENT_FORBIDDEN");
  }

  if (process.env.SQUARE_ENVIRONMENT !== "sandbox") {
    throw new Error("SANDBOX_SQUARE_ENVIRONMENT_REQUIRED");
  }

  const locationId = process.env.SQUARE_SANDBOX_LOCATION_ID;

  if (typeof locationId !== "string" || !locationId.trim()) {
    throw new Error("SANDBOX_SQUARE_LOCATION_REQUIRED");
  }

  let client;

  if (testMode && testClient !== undefined) {
    client = testClient;
  } else {
    const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;

    if (typeof token !== "string" || !token.trim()) {
      throw new Error("SANDBOX_SQUARE_TOKEN_REQUIRED");
    }

    client = new SquareClient({
      token: token.trim(),
      environment: SquareEnvironment.Sandbox
    });
  }

  if (typeof client?.orders?.search !== "function") {
    throw new Error("SQUARE_ORDER_SEARCH_UNAVAILABLE");
  }

  return async function readSquareOrders({ orderId } = {}) {
    return collectV3SandboxOrderRecordEvidence({
      orderId,
      maxPages: 10,

      listPage: async ({ cursor }) => {
        // Do not exclude OPEN or other order states.
        // Do not restrict historical coverage by date.
        const request = {
          locationIds: [locationId.trim()],
          limit: 1000,
          returnEntries: false,
          ...(cursor ? { cursor } : {})
        };

        const pending = client.orders.search(
          request,
          { maxRetries: 0 }
        );

        const data =
          typeof pending?.withRawResponse === "function"
            ? (await pending.withRawResponse())?.data
            : await pending;

        if (
          !data ||
          !Array.isArray(data.orders) ||
          (data.errors !== undefined &&
            !Array.isArray(data.errors)) ||
          (data.errors?.length ?? 0) > 0
        ) {
          throw new Error("SQUARE_ORDER_SEARCH_RESPONSE_INVALID");
        }

        return {
          orders: data.orders,
          cursor: data.cursor,
          errors: data.errors
        };
      }
    });
  };
}