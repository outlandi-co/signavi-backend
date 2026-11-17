export function createV3WebhookStorefrontFilter(order) {
  if (order?.storefront !== "signavi_store") {
    throw new Error("V3 webhook storefront ownership mismatch.");
  }

  return Object.freeze({
    storefront: "signavi_store"
  });
}
