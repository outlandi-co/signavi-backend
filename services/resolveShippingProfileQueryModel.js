import {
  getShippingProfileModelForChannel
} from "../models/ShippingProfileForChannel.js";

const CHANNELS = new Set([
  "signavi_studio",
  "signavi_store"
]);

export function resolveShippingProfileQueryModel(
  channel,
  {
    legacyModel,
    isolatedModelResolver = getShippingProfileModelForChannel,
    enabled =
      process.env.SIGNAVI_SHIPPING_PROFILE_ISOLATION === "true",
    environment = process.env.NODE_ENV
  } = {}
) {
  if (!CHANNELS.has(channel)) {
    throw new Error("INVALID_SHIPPING_CHANNEL");
  }

  if (typeof enabled !== "boolean") {
    throw new Error("INVALID_SHIPPING_ISOLATION_FLAG");
  }

  // Production must preserve the existing shipping path
  // until the migration and rollout are explicitly reviewed.
  if (environment === "production" || enabled === false) {
    if (!legacyModel || typeof legacyModel.find !== "function") {
      throw new Error("LEGACY_SHIPPING_PROFILE_MODEL_UNAVAILABLE");
    }

    return legacyModel;
  }

  // Isolation is fail-closed.
  if (typeof isolatedModelResolver !== "function") {
    throw new Error("ISOLATED_SHIPPING_PROFILE_RESOLVER_UNAVAILABLE");
  }

  const model = isolatedModelResolver(channel);

  if (
    !model ||
    model.db?.name !== channel ||
    model.db?.readyState !== 1 ||
    model.modelName !== "ShippingProductPackageProfile" ||
    model.collection?.name !== "shippingproductpackageprofiles" ||
    model.collection?.conn !== model.db ||
    typeof model.find !== "function"
  ) {
    throw new Error("SHIPPING_PROFILE_DATABASE_BINDING_MISMATCH");
  }

  return model;
}
