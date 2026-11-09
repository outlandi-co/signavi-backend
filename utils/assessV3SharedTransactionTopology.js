
const blocked = reason => Object.freeze({
  compatible: false,
  reason,
  initializationAuthorized: false,
  squareRequestAuthorized: false
});

/**
 * Precondition for a future same-session cross-database transaction.
 *
 * Sharing a MongoDB client is necessary, but not sufficient,
 * for the complete checkout authorization workflow.
 *
 * This module performs no database operations.
 */
export function assessV3SharedTransactionTopology({
  storefrontConnection,
  sandboxConnection
} = {}) {
  if (
    storefrontConnection?.readyState !== 1 ||
    sandboxConnection?.readyState !== 1 ||
    storefrontConnection === sandboxConnection
  ) {
    return blocked("DISTINCT_CONNECTED_DATABASES_REQUIRED");
  }

  if (
    storefrontConnection.db?.databaseName !== "signavi_store" ||
    sandboxConnection.db?.databaseName !== "signavi_shipping_v3_dev"
  ) {
    return blocked("DATABASE_NAME_MISMATCH");
  }

  if (
    typeof storefrontConnection.getClient !== "function" ||
    typeof sandboxConnection.getClient !== "function"
  ) {
    return blocked("MONGODB_CLIENT_IDENTITY_UNAVAILABLE");
  }

  let storefrontClient;
  let sandboxClient;

  try {
    storefrontClient = storefrontConnection.getClient();
    sandboxClient = sandboxConnection.getClient();
  } catch {
    return blocked("MONGODB_CLIENT_IDENTITY_UNCERTAIN");
  }

  if (
    !storefrontClient ||
    !sandboxClient ||
    storefrontClient !== sandboxClient
  ) {
    return blocked("SEPARATE_MONGODB_CLIENTS");
  }

  if (
    typeof storefrontClient.startSession !== "function" ||
    typeof storefrontClient.db !== "function"
  ) {
    return blocked("SHARED_CLIENT_SESSION_UNAVAILABLE");
  }

  return Object.freeze({
    compatible: true,
    reason: "SHARED_CLIENT_TOPOLOGY_ONLY",
    initializationAuthorized: false,
    squareRequestAuthorized: false
  });
}
