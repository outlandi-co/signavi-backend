const VALID_CHANNELS = new Set([
  "signavi_studio",
  "signavi_store"
]);

export function resolveProductCatalogModel(
  channel,
  {
    legacyModel,
    isolatedModelResolver,
    enabled = process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION === "true"
  } = {}
) {
  if (!VALID_CHANNELS.has(channel)) {
    throw new Error("INVALID_PRODUCT_CHANNEL");
  }

  if (enabled !== true && enabled !== false) {
    throw new Error("INVALID_ISOLATION_FLAG");
  }

  if (enabled === false) {
    if (!legacyModel) {
      throw new Error("LEGACY_PRODUCT_MODEL_UNAVAILABLE");
    }

    return legacyModel;
  }

  // Isolation is fail-closed. Never silently use the shared model.
  if (typeof isolatedModelResolver !== "function") {
    throw new Error("ISOLATED_PRODUCT_MODEL_RESOLVER_UNAVAILABLE");
  }

  const model = isolatedModelResolver(channel);

  const expectedDatabase = channel;

  if (
    !model ||
    model.db?.name !== expectedDatabase ||
    model.db?.readyState !== 1 ||
    model.modelName !== "Product" ||
    model.collection?.name !== "products" ||
    model.collection?.conn !== model.db
  ) {
    throw new Error("PRODUCT_DATABASE_BINDING_MISMATCH");
  }

  return model;
}