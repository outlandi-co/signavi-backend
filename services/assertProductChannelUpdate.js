const CHANNELS = new Set(["signavi_studio", "signavi_store"]);

export function assertProductChannelUpdate({
  req,
  existingProduct,
  updates,
  enabled = process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION === "true"
}) {
  if (typeof enabled !== "boolean") {
    throw new Error("INVALID_ISOLATION_FLAG");
  }

  if (!enabled) return true;

  // Isolated product updates must use plain field assignments.
  // Block MongoDB operators and dotted update paths.
  if (
    !updates ||
    typeof updates !== "object" ||
    Array.isArray(updates)
  ) {
    throw new Error("INVALID_PRODUCT_UPDATE");
  }

  for (const key of Object.keys(updates)) {
    if (key.startsWith("$") || key.includes(".")) {
      throw new Error("PRODUCT_UPDATE_OPERATOR_FORBIDDEN");
    }
  }


  const values = [
    req?.query?.storefront,
    req?.query?.salesChannel,
    req?.body?.storefront,
    req?.body?.salesChannel
  ].filter(value => value != null);

  if (
    values.length === 0 ||
    !CHANNELS.has(values[0]) ||
    values.some(value => value !== values[0])
  ) {
    throw new Error("PRODUCT_CHANNEL_REQUIRED_OR_CONFLICTING");
  }

  const channel = values[0];

  if (
    !existingProduct ||
    existingProduct.storefront !== channel ||
    existingProduct.salesChannel !== channel
  ) {
    throw new Error("EXISTING_PRODUCT_CHANNEL_MISMATCH");
  }

  for (const key of ["storefront", "salesChannel"]) {
    if (
      Object.prototype.hasOwnProperty.call(updates ?? {}, key) &&
      updates[key] !== channel
    ) {
      throw new Error("PRODUCT_CHANNEL_CHANGE_FORBIDDEN");
    }
  }

  return true;
}