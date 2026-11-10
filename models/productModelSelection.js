import { getStoreProductModel } from "./StoreProduct.js";
import { getStudioProductModel } from "./StudioProduct.js";

const DATABASE_BY_CHANNEL = Object.freeze({
  signavi_studio: "signavi_studio",
  signavi_store: "signavi_store"
});

export function assertProductModelBinding(model, channel) {
  const expectedDatabase = DATABASE_BY_CHANNEL[channel];

  if (!expectedDatabase) {
    throw new Error("INVALID_PRODUCT_CHANNEL");
  }

  if (
    !model ||
    !model.db ||
    model.db.name !== expectedDatabase ||
    model.db.readyState !== 1 ||
    model.modelName !== "Product" ||
    model.collection?.name !== "products" ||
    model.collection?.conn !== model.db
  ) {
    throw new Error("PRODUCT_DATABASE_BINDING_MISMATCH");
  }

  return model;
}

export function getProductModelForChannel(channel) {
  if (!Object.hasOwn(DATABASE_BY_CHANNEL, channel)) {
    throw new Error("INVALID_PRODUCT_CHANNEL");
  }

  const model =
    channel === "signavi_studio"
      ? getStudioProductModel()
      : getStoreProductModel();

  return assertProductModelBinding(model, channel);
}