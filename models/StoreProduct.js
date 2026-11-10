import {
  getStoreDatabase,
  STORE_DATABASE_NAME
} from "../config/storeDatabase.js";

import { productSchema } from "./Product.js";

const STORE_COLLECTION = "products";
const STORE_CHANNEL = "signavi_store";

export function getStoreProductModel() {
  const connection = getStoreDatabase();

  if (
    connection.name !== STORE_DATABASE_NAME ||
    connection.readyState !== 1
  ) {
    throw new Error("STORE_PRODUCT_DATABASE_UNAVAILABLE");
  }

  const existing = connection.models.Product;

  if (existing) {
    if (
      existing.db !== connection ||
      existing.collection.name !== STORE_COLLECTION ||
      existing.collection.conn !== connection
    ) {
      throw new Error("STORE_PRODUCT_MODEL_MISMATCH");
    }

    return existing;
  }

  const schema = productSchema.clone();

  schema.pre("validate", function enforceStoreChannel() {
    if (
      this.storefront !== STORE_CHANNEL ||
      this.salesChannel !== STORE_CHANNEL
    ) {
      throw new Error("STORE_PRODUCT_CHANNEL_MISMATCH");
    }
  });

  return connection.model(
    "Product",
    schema,
    STORE_COLLECTION
  );
}