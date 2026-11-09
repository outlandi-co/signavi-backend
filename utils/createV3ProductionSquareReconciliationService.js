import { SquareClient, SquareEnvironment } from "square";

import {
  createV3ProductionSquareHistoryReader
} from "./createV3ProductionSquareHistoryReader.js";

import {
  reconcileV3SquareLinkHistoryReadOnly
} from "./reconcileV3SquareLinkHistoryReadOnly.js";

/**
 * Server-owned read-only Square reconciliation service.
 *
 * Never authorizes payment creation.
 * Never retry an uncertain payment.
 * Never expose as a public HTTP route.
 */
export function createV3ProductionSquareReconciliationService({
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
    throw new Error("SQUARE_PRODUCTION_LOCATION_REQUIRED");
  }

  let client;

  if (testMode && testClient !== undefined) {
    client = testClient;
  } else {
    if (
      process.env.SQUARE_ENVIRONMENT !== "production"
    ) {
      throw new Error("SQUARE_PRODUCTION_ENVIRONMENT_REQUIRED");
    }

    const token =
      process.env.SQUARE_PRODUCTION_ACCESS_TOKEN;

    if (
      typeof token !== "string" ||
      !token.trim()
    ) {
      throw new Error("SQUARE_PRODUCTION_TOKEN_REQUIRED");
    }

    client = new SquareClient({
      token,
      environment: SquareEnvironment.Production
    });
  }

  if (
    typeof client.checkout?.paymentLinks?.list !== "function" ||
    typeof client.orders?.get !== "function"
  ) {
    throw new Error("SQUARE_READ_CLIENT_INCOMPLETE");
  }

  const historyReader = createV3ProductionSquareHistoryReader(
    testMode && testClient !== undefined
      ? { testClient: client }
      : {}
  );

  return Object.freeze({
    async reconcile({ orderId } = {}) {
      const evidence =
        await reconcileV3SquareLinkHistoryReadOnly({
          orderId,
          historyReader,
          ordersClient: client.orders
        });

      return Object.freeze({
        ...evidence,
        authoritativeNoPriorActivity: false,
        squareRequestAuthorized: false,
        retryAuthorized: false
      });
    }
  });
}