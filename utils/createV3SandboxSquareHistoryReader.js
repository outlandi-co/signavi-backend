import { SquareClient, SquareEnvironment } from "square";

import {
  collectV3SquareHistoryFromSdk
} from "./collectV3SquareHistoryFromSdk.js";

/**
 * Server-owned, read-only Square Sandbox history.
 *
 * Finding no matching links does NOT authorize checkout.
 * This function never creates a Square payment link.
 */
export function createV3SandboxSquareHistoryReader({
  testClient
} = {}) {
  const testMode = process.env.NODE_ENV === "test";

  if (testClient !== undefined && !testMode) {
    throw new Error("SQUARE_TEST_CLIENT_FORBIDDEN");
  }

  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    throw new Error("SANDBOX_SQUARE_HISTORY_DISABLED");
  }

  const locationId = process.env.SQUARE_SANDBOX_LOCATION_ID;

  if (
    typeof locationId !== "string" ||
    !locationId.trim()
  ) {
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

  const paymentLinksClient = client?.checkout?.paymentLinks;

  if (typeof paymentLinksClient?.list !== "function") {
    throw new Error("SANDBOX_SQUARE_LIST_UNAVAILABLE");
  }

  return Object.freeze({
    async collectHistory({ maxPages = 10 } = {}) {
      const result = await collectV3SquareHistoryFromSdk({
        paymentLinksClient,
        maxPages
      });

      return Object.freeze({
        ...result,
        authoritativeNoPriorActivity: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    }
  });
}