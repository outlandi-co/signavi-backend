import { resolveProductCatalogModel } from "./resolveProductCatalogModel.js";

const CHANNELS = new Set(["signavi_studio", "signavi_store"]);

export function resolveProductRequestModel(
  req,
  {
    legacyModel,
    isolatedModelResolver,
    enabled = process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION === "true"
  }
) {
  if (enabled !== true && enabled !== false) {
    throw new Error("INVALID_ISOLATION_FLAG");
  }

  if (!enabled) {
    if (!legacyModel) {
      throw new Error("LEGACY_PRODUCT_MODEL_UNAVAILABLE");
    }
    return legacyModel;
  }

  const supplied = [
    req?.query?.storefront,
    req?.query?.salesChannel,
    req?.body?.storefront,
    req?.body?.salesChannel
  ].filter(value => value !== undefined && value !== null);

  if (!supplied.length) {
    throw new Error("PRODUCT_CHANNEL_REQUIRED");
  }

  const channel = supplied[0];

  if (
    !CHANNELS.has(channel) ||
    supplied.some(value => value !== channel)
  ) {
    throw new Error("PRODUCT_CHANNEL_CONFLICT_OR_INVALID");
  }

  return resolveProductCatalogModel(channel, {
    legacyModel,
    isolatedModelResolver,
    enabled: true
  });
}