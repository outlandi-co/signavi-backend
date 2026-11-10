const VALID_CHANNELS = new Set([
  "signavi_studio",
  "signavi_store"
]);

function channelError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function resolveProductChannel({ query = {}, body = {} } = {}) {
  const provided = [];

  for (const source of [query, body]) {
    for (const field of ["storefront", "salesChannel"]) {
      if (Object.prototype.hasOwnProperty.call(source, field)) {
        const value = source[field];

        if (typeof value !== "string" || !VALID_CHANNELS.has(value)) {
          throw channelError("INVALID_PRODUCT_CHANNEL");
        }

        provided.push(value);
      }
    }
  }

  if (provided.length === 0) {
    throw channelError("PRODUCT_CHANNEL_REQUIRED");
  }

  if (new Set(provided).size !== 1) {
    throw channelError("PRODUCT_CHANNEL_CONFLICT");
  }

  return provided[0];
}

export function assertProductChannelImmutable(channel, updates = {}) {
  if (!VALID_CHANNELS.has(channel)) {
    throw channelError("INVALID_PRODUCT_CHANNEL");
  }

  for (const field of ["storefront", "salesChannel"]) {
    if (
      Object.prototype.hasOwnProperty.call(updates, field) &&
      updates[field] !== channel
    ) {
      throw channelError("PRODUCT_CHANNEL_CHANGE_FORBIDDEN");
    }
  }
}