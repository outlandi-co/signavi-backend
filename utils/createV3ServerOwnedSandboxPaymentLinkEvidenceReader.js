import {
  SquareClient,
  SquareEnvironment
} from "square";

import {
  createV3SandboxSquareHistoryReader
} from "./createV3SandboxSquareHistoryReader.js";

import {
  createV3SandboxLinkEvidenceReader
} from "./createV3SandboxLinkEvidenceReader.js";

/**
 * Server-constructed Square Sandbox Payment Link reader.
 *
 * Mock SDK injection is permitted only in NODE_ENV=test.
 * This does not prove authoritative historical absence,
 * authorize payment creation, or perform writes.
 */
export function createV3ServerOwnedSandboxPaymentLinkEvidenceReader({
  testClient
} = {}) {
  const testMode = process.env.NODE_ENV === "test";

  if (
    !["test", "development"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    throw new Error("V3_SANDBOX_PAYMENT_LINK_REVIEW_DISABLED");
  }

  if (testClient !== undefined && !testMode) {
    throw new Error("V3_EXTERNAL_SQUARE_CLIENT_FORBIDDEN");
  }

  const locationId = process.env.SQUARE_SANDBOX_LOCATION_ID;

  if (
    typeof locationId !== "string" ||
    !locationId.trim()
  ) {
    throw new Error("V3_SANDBOX_LOCATION_REQUIRED");
  }

  let client;

  if (testMode && testClient !== undefined) {
    client = testClient;
  } else {
    const token = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;

    if (typeof token !== "string" || !token.trim()) {
      throw new Error("V3_SANDBOX_TOKEN_REQUIRED");
    }

    client = new SquareClient({
      token: token.trim(),
      environment: SquareEnvironment.Sandbox
    });
  }

  if (
    typeof client?.checkout?.paymentLinks?.list !== "function" ||
    typeof client?.orders?.get !== "function"
  ) {
    throw new Error("V3_SQUARE_READ_CLIENT_INVALID");
  }

  // Reuse the established SDK pagination reader.
  // The existing factory creates its own server SDK client
  // outside test mode, using the same sandbox environment.
  const historyReader = testMode && testClient !== undefined
    ? createV3SandboxSquareHistoryReader({
        testClient: client
      })
    : createV3SandboxSquareHistoryReader();

  const readPaymentLinks =
    createV3SandboxLinkEvidenceReader({
      historyReader,
      ordersClient: client.orders
    });

  if (typeof readPaymentLinks !== "function") {
    throw new Error("V3_PAYMENT_LINK_READER_INVALID");
  }

  return readPaymentLinks;
}
