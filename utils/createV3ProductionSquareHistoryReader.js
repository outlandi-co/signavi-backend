import { SquareClient, SquareEnvironment } from "square";

import {
  collectV3SquareHistoryFromSdk
} from "./collectV3SquareHistoryFromSdk.js";

/**
 * Server-owned, read-only Square history reader.
 *
 * Never call from a public HTTP route.
 * Collection results NEVER authorize Square creation.
 *
 * Test client injection is restricted to NODE_ENV=test.
 */
export function createV3ProductionSquareHistoryReader({
  testClient
} = {}) {
  const testMode = process.env.NODE_ENV === "test";

  if (testClient !== undefined && !testMode) {
    throw new Error("SQUARE_TEST_CLIENT_FORBIDDEN");
  }

  const locationId =
    process.env.SQUARE_PRODUCTION_LOCATION_ID;

  if (
    typeof locationId !== "string" ||
    !locationId.trim()
  ) {
    throw new Error("PRODUCTION_SQUARE_LOCATION_REQUIRED");
  }

  let client;

  if (testMode && testClient !== undefined) {
    client = testClient;
  } else {
    if (
      String(process.env.SQUARE_ENVIRONMENT || "")
        .toLowerCase() !== "production"
    ) {
      throw new Error("PRODUCTION_SQUARE_ENVIRONMENT_REQUIRED");
    }

    const token =
      process.env.SQUARE_PRODUCTION_ACCESS_TOKEN;

    if (
      typeof token !== "string" ||
      !token.trim()
    ) {
      throw new Error("PRODUCTION_SQUARE_TOKEN_REQUIRED");
    }

    client = new SquareClient({
      token,
      environment: SquareEnvironment.Production
    });
  }

  const paymentLinksClient =
    client?.checkout?.paymentLinks;

  if (
    typeof paymentLinksClient?.list !== "function"
  ) {
    throw new Error("SQUARE_LIST_CLIENT_UNAVAILABLE");
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