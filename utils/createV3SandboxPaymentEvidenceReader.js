import { SquareClient, SquareEnvironment } from "square";

import {
  collectV3SandboxPaymentRecordEvidence
} from "./collectV3SandboxPaymentRecordEvidence.js";

/**
 * Server-owned, read-only Square Sandbox payment adapter.
 *
 * Injecting a fake SDK client is allowed only in NODE_ENV=test.
 * This adapter never authorizes payment creation.
 */
export function createV3SandboxPaymentEvidenceReader({
  testClient
} = {}) {
  const testMode = process.env.NODE_ENV === "test";

  if (testClient !== undefined && !testMode) {
    throw new Error("SQUARE_TEST_CLIENT_FORBIDDEN");
  }

  if (process.env.SQUARE_ENVIRONMENT !== "sandbox") {
    throw new Error("SANDBOX_SQUARE_ENVIRONMENT_REQUIRED");
  }

  const locationId =
    process.env.SQUARE_SANDBOX_LOCATION_ID;

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

  if (typeof client?.payments?.list !== "function") {
    throw new Error("SANDBOX_PAYMENT_LIST_UNAVAILABLE");
  }

  return async function readSquarePayments({ orderId } = {}) {
    return collectV3SandboxPaymentRecordEvidence({
      orderId,
      maxPages: 10,

      listPage: async ({ cursor }) => {
        const request = {
          locationId: locationId.trim(),
          limit: 100,
          ...(cursor ? { cursor } : {})
        };

        const pending = client.payments.list(
          request,
          { maxRetries: 0 }
        );

        let data;

        if (
          pending &&
          typeof pending.withRawResponse === "function"
        ) {
          const response = await pending.withRawResponse();
          data = response?.data;
        } else {
          const page = await pending;
          data = page?.response;
        }

        if (
          !data ||
          !Array.isArray(data.payments) ||
          (data.errors?.length ?? 0) > 0
        ) {
          throw new Error("SQUARE_PAYMENT_PAGE_INVALID");
        }

        return {
          payments: data.payments,
          cursor: data.cursor,
          errors: data.errors
        };
      }
    });
  };
}