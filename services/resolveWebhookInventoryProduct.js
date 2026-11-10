import { resolveProductCatalogModel } from "./resolveProductCatalogModel.js";

const CHANNELS = new Set(["signavi_studio", "signavi_store"]);

function stop(message) {
  throw new Error(message);
}

export async function resolveWebhookInventoryProduct({
  item,
  order,
  legacyModel,
  isolatedModelResolver,
  strict = process.env.SIGNAVI_STRICT_WEBHOOK_INVENTORY === "true",
  isolationEnabled = process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION === "true"
}) {
  if (!legacyModel || typeof legacyModel.findOne !== "function") {
    stop("LEGACY_INVENTORY_MODEL_UNAVAILABLE");
  }

  // Default mode preserves the existing webhook lookup.
  if (!strict) {
    return legacyModel.findOne({ name: item?.name });
  }

  const channel = order?.storefront;

  if (!CHANNELS.has(channel)) {
    stop("WEBHOOK_INVENTORY_CHANNEL_UNVERIFIED");
  }

  if (
    order.salesChannel != null &&
    order.salesChannel !== channel
  ) {
    stop("WEBHOOK_INVENTORY_CHANNEL_CONFLICT");
  }

  const productId = String(item?.productId ?? "").trim();

  if (!/^[a-f0-9]{24}$/i.test(productId)) {
    stop("WEBHOOK_INVENTORY_PRODUCT_ID_UNVERIFIED");
  }

  const Model = resolveProductCatalogModel(channel, {
    legacyModel,
    isolatedModelResolver,
    enabled: isolationEnabled
  });

  // Strict mode never matches a product solely by its name.
  const product = await Model.findOne({
    _id: productId,
    storefront: channel,
    salesChannel: channel
  });

  if (!product) {
    stop("WEBHOOK_INVENTORY_PRODUCT_NOT_FOUND");
  }

  if (
    String(product._id).toLowerCase() !== productId.toLowerCase() ||
    product.storefront !== channel ||
    product.salesChannel !== channel
  ) {
    stop("WEBHOOK_INVENTORY_PRODUCT_OWNERSHIP_MISMATCH");
  }

  return product;
}