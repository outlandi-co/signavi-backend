export async function initializeShippingProfileDatabases({
  enabled,
  environment,
  connectStore,
  connectStudio
}) {
  // No isolated connections in production.
  if (environment === "production" || enabled !== true) {
    return false;
  }

  if (
    typeof connectStore !== "function" ||
    typeof connectStudio !== "function"
  ) {
    throw new Error("SHIPPING_DATABASE_CONNECTOR_UNAVAILABLE");
  }

  // Fail startup if either connection fails.
  await connectStore();
  await connectStudio();

  return true;
}
