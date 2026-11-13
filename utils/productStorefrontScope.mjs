export const PRODUCT_STOREFRONTS = Object.freeze([
  "signavi_store",
  "signavi_studio"
]);

export function normalizeProductStorefront(value) {
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();

  return PRODUCT_STOREFRONTS.includes(normalized)
    ? normalized
    : null;
}

export function createProductStorefrontScope({
  user,
  storefront,
  productId
} = {}) {
  if (!user || user.role !== "admin") {
    return {
      ok: false,
      status: 403,
      code: "ADMIN_REQUIRED"
    };
  }

  const channel = normalizeProductStorefront(storefront);

  if (!channel) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_STOREFRONT"
    };
  }

  if (
    typeof productId !== "string" ||
    !/^[a-f0-9]{24}$/i.test(productId)
  ) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_PRODUCT_ID"
    };
  }

  return {
    ok: true,
    storefront: channel,
    filter: {
      _id: productId,
      storefront: channel
    }
  };
}

export function matchesProductStorefront(product, channel) {
  if (!product) return false;

  return (
    normalizeProductStorefront(product.storefront) === channel &&
    normalizeProductStorefront(product.salesChannel) === channel
  );
}
