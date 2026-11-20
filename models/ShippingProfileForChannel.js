import {
  getStudioDatabase
} from "../config/studioDatabase.js";

import {
  getStoreDatabase
} from "../config/storeDatabase.js";

import {
  shippingProductPackageProfileSchema
} from "./ShippingProductPackageProfile.js";

import {
  assertShippingModelBinding
} from "../services/assertShippingModelBinding.js";

const MODEL = "ShippingProductPackageProfile";
const COLLECTION = "shippingproductpackageprofiles";

const CHANNELS = new Set([
  "signavi_studio",
  "signavi_store"
]);

export function bindShippingProfileModel(connection, channel) {
  if (!CHANNELS.has(channel)) {
    throw new Error("INVALID_SHIPPING_CHANNEL");
  }

  if (
    !connection ||
    connection.name !== channel ||
    connection.readyState !== 1
  ) {
    throw new Error("SHIPPING_DATABASE_BINDING_MISMATCH");
  }

  let model = connection.models?.[MODEL];

  if (!model) {
    if (typeof connection.model !== "function") {
      throw new Error("SHIPPING_MODEL_FACTORY_UNAVAILABLE");
    }

    model = connection.model(
      MODEL,
      shippingProductPackageProfileSchema.clone(),
      COLLECTION
    );
  }

  return assertShippingModelBinding(
    model,
    channel,
    MODEL
  );
}

export function getShippingProfileModelForChannel(channel) {
  if (!CHANNELS.has(channel)) {
    throw new Error("INVALID_SHIPPING_CHANNEL");
  }

  const connection =
    channel === "signavi_studio"
      ? getStudioDatabase()
      : getStoreDatabase();

  return bindShippingProfileModel(connection, channel);
}
