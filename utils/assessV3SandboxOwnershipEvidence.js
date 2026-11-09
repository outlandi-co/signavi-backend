const validId = value =>
  typeof value === "string" &&
  /^[a-f0-9]{24}$/i.test(value);

const blocked = (orderId, reason) => Object.freeze({
  orderId,
  environment: "sandbox",
  complete: false,
  reason,
  exclusive: false,
  durable: false,
  authoritativeNoPriorActivity: false,
  initializationAuthorized: false,
  squareRequestAuthorized: false,
  retryAuthorized: false
});

/**
 * Evaluates read-only ownership snapshots.
 *
 * Snapshot consistency is not equivalent to acquiring a
 * durable exclusive claim. This utility cannot grant one.
 */
export function assessV3SandboxOwnershipEvidence({
  orderId,
  storefront,
  sandbox
} = {}) {
  const id = typeof orderId === "string"
    ? orderId.toLowerCase()
    : "";

  if (!validId(id)) {
    return blocked(id, "INVALID_ORDER_ID");
  }

  if (
    !storefront ||
    !sandbox ||
    storefront.databaseName !== "signavi_store" ||
    sandbox.databaseName !== "signavi_shipping_v3_dev"
  ) {
    return blocked(id, "DATABASE_BOUNDARY_UNVERIFIED");
  }

  const storefrontOrder = storefront.order;

  if (
    !storefrontOrder ||
    String(storefrontOrder._id ?? "").toLowerCase() !== id
  ) {
    return blocked(id, "STOREFRONT_ORDER_IDENTITY_MISMATCH");
  }

  const purchase = sandbox.purchase;

  if (purchase != null) {
    if (
      purchase.environment !== "sandbox" ||
      purchase.purchaseKey !== `order:${id}`
    ) {
      return blocked(id, "SANDBOX_PURCHASE_IDENTITY_CONFLICT");
    }

    return blocked(id, "EXISTING_SANDBOX_PURCHASE_CLAIM");
  }

  const sandboxOperation = sandbox.operation;

  if (sandboxOperation != null) {
    return blocked(id, "EXISTING_SANDBOX_PAYMENT_OPERATION");
  }

  if (storefront.operation != null) {
    return blocked(id, "STOREFRONT_PAYMENT_OPERATION_PRESENT");
  }

  // A consistent snapshot is useful for investigation but
  // cannot prove absence, exclusivity, or index durability.
  return Object.freeze({
    orderId: id,
    environment: "sandbox",
    complete: true,
    reason: "OWNERSHIP_SNAPSHOT_REQUIRES_ATOMIC_CLAIM",
    exclusive: false,
    durable: false,
    authoritativeNoPriorActivity: false,
    initializationAuthorized: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  });
}