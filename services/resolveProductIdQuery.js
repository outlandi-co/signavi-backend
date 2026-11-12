const CHANNELS = new Set(["signavi_studio", "signavi_store"]);

export function resolveProductIdQuery(
  req,
  id,
  {
    enabled = process.env.SIGNAVI_PRODUCT_DATABASE_ISOLATION === "true"
  } = {}
) {
  if (typeof enabled !== "boolean") {
    throw new Error("INVALID_ISOLATION_FLAG");
  }

  if (typeof id !== "string" || !id.trim()) {
    throw new Error("PRODUCT_ID_REQUIRED");
  }


  const supplied = [
    req?.query?.storefront,
    req?.query?.salesChannel,
    req?.body?.storefront,
    req?.body?.salesChannel
  ].filter(value => value !== undefined && value !== null);

  if (
    supplied.length === 0 ||
    !CHANNELS.has(supplied[0]) ||
    supplied.some(value => value !== supplied[0])
  ) {
    throw new Error("PRODUCT_CHANNEL_REQUIRED_OR_CONFLICTING");
  }

  const channel = supplied[0];

  return {
    _id: id,
    storefront: channel,
    salesChannel: channel
  };
}