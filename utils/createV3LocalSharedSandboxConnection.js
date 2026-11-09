
import {
  assessV3SharedTransactionTopology
} from "./assessV3SharedTransactionTopology.js";

/**
 * Test-only local MongoDB connection factory.
 *
 * Uses the existing local MongoDB client rather than creating
 * another client. No queries, writes, or Square requests.
 *
 * Never call this from production checkout routes.
 */
export function createV3LocalSharedSandboxConnection({
  storefrontConnection
} = {}) {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    throw new Error("V3_SHARED_CONNECTION_TEST_ONLY");
  }

  if (
    storefrontConnection?.readyState !== 1 ||
    storefrontConnection.db?.databaseName !== "signavi_store" ||
    !["127.0.0.1", "localhost"].includes(
      storefrontConnection.host
    ) ||
    Number(storefrontConnection.port) !== 27028
  ) {
    throw new Error("V3_LOCAL_TEST_STOREFRONT_REQUIRED");
  }

  if (
    typeof storefrontConnection.useDb !== "function" ||
    typeof storefrontConnection.getClient !== "function"
  ) {
    throw new Error("V3_SHARED_CLIENT_CAPABILITY_REQUIRED");
  }

  const client = storefrontConnection.getClient();

  if (
    !client ||
    typeof client.db !== "function" ||
    typeof client.startSession !== "function"
  ) {
    throw new Error("V3_LOCAL_TEST_CLIENT_INVALID");
  }

  const sandboxConnection = storefrontConnection.useDb(
    "signavi_shipping_v3_dev",
    { useCache: true }
  );

  const topology = assessV3SharedTransactionTopology({
    storefrontConnection,
    sandboxConnection
  });

  if (topology.compatible !== true) {
    throw new Error(
      "V3_SHARED_TRANSACTION_TOPOLOGY_REJECTED:" +
      topology.reason
    );
  }

  return Object.freeze({
    storefrontConnection,
    sandboxConnection,
    sharedClientVerified: true,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}
