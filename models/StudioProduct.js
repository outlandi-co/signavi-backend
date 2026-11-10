import { getStudioDatabase, STUDIO_DATABASE_NAME } from "../config/studioDatabase.js";
import { productSchema } from "./Product.js";

const STUDIO_COLLECTION = "products";
const STUDIO_CHANNEL = "signavi_studio";

export function getStudioProductModel() {
  const connection = getStudioDatabase();

  if (
    connection.name !== STUDIO_DATABASE_NAME ||
    connection.readyState !== 1
  ) {
    throw new Error("STUDIO_PRODUCT_DATABASE_UNAVAILABLE");
  }

  const existing = connection.models.Product;

  if (existing) {
    if (
      existing.db !== connection ||
      existing.collection.name !== STUDIO_COLLECTION
    ) {
      throw new Error("STUDIO_PRODUCT_MODEL_MISMATCH");
    }

    return existing;
  }

  const schema = productSchema.clone();

  schema.pre("validate", function enforceStudioChannel() {
    if (
      this.storefront !== STUDIO_CHANNEL ||
      this.salesChannel !== STUDIO_CHANNEL
    ) {
      throw new Error("STUDIO_PRODUCT_CHANNEL_MISMATCH");
    }
  });

  return connection.model(
    "Product",
    schema,
    STUDIO_COLLECTION
  );
}