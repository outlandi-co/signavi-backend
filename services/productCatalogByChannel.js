import { getProductModelForChannel } from "../models/productModelSelection.js";

const CHANNELS = new Set(["signavi_studio", "signavi_store"]);

function catalogError(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function assertCatalogOwnership(channel, requestedIds, products) {
  if (!CHANNELS.has(channel)) {
    throw catalogError("INVALID_PRODUCT_CHANNEL", 400);
  }

  if (!Array.isArray(requestedIds) || !Array.isArray(products)) {
    throw catalogError("INVALID_PRODUCT_CATALOG_INPUT", 400);
  }

  const ids = requestedIds.map((id) => String(id).toLowerCase());

  if (ids.some((id) => !/^[a-f0-9]{24}$/.test(id))) {
    throw catalogError("INVALID_PRODUCT_ID", 400);
  }

  const expected = new Set(ids);
  const found = new Set();

  for (const product of products) {
    const id = String(product?._id ?? "").toLowerCase();

    if (
      !expected.has(id) ||
      found.has(id) ||
      product?.storefront !== channel ||
      product?.salesChannel !== channel
    ) {
      throw catalogError("PRODUCT_CATALOG_OWNERSHIP_MISMATCH");
    }

    found.add(id);
  }

  if (found.size !== expected.size) {
    throw catalogError("PRODUCT_CATALOG_INCOMPLETE");
  }

  return products;
}

export async function loadCatalogProductsForChannel(channel, requestedIds) {
  if (!CHANNELS.has(channel)) {
    throw catalogError("INVALID_PRODUCT_CHANNEL", 400);
  }

  if (
    !Array.isArray(requestedIds) ||
    requestedIds.length === 0 ||
    requestedIds.some((id) => !/^[a-f0-9]{24}$/i.test(String(id)))
  ) {
    throw catalogError("INVALID_PRODUCT_IDS", 400);
  }

  const ids = [...new Set(
    requestedIds.map((id) => String(id).toLowerCase())
  )];

  // Never fall back to the default Product model.
  const Product = getProductModelForChannel(channel);

  const products = await Product.find({
    _id: { $in: ids },
    storefront: channel,
    salesChannel: channel
  });

  return assertCatalogOwnership(channel, ids, products);
}