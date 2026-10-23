import crypto from "node:crypto"

const TTL_SECONDS = 15 * 60

const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

const decode = (value) =>
  JSON.parse(Buffer.from(value, "base64url").toString("utf8"))

const getSecret = () => {
  const secret = process.env.SHIPPING_V3_QUOTE_SECRET

  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("V3 quote signing secret is not configured.")
  }

  return secret
}

const sign = (payload, secret) =>
  crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")

export const createV3SignedQuote = ({
  cartFingerprint,
  shippingAmountCents,
  parcelRateIds,
  carrier,
  serviceToken,
  now = Date.now()
}) => {
  if (
    typeof cartFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(cartFingerprint) ||
    !Number.isSafeInteger(shippingAmountCents) ||
    shippingAmountCents <= 0 ||
    !Array.isArray(parcelRateIds) ||
    parcelRateIds.length < 1 ||
    parcelRateIds.length > 10 ||
    !parcelRateIds.every(id => typeof id === "string" && id.length > 0) ||
    new Set(parcelRateIds).size !== parcelRateIds.length ||
    typeof carrier !== "string" ||
    !["USPS", "UPS"].includes(carrier) ||
    typeof serviceToken !== "string" ||
    !/^(usps|ups)_[a-z0-9_]+$/.test(serviceToken) ||
    !serviceToken.startsWith(carrier.toLowerCase() + "_") ||
    !Number.isSafeInteger(now) ||
    now < 0
  ) {
    throw new Error("Invalid V3 shipping quote.")
  }

  const payload = {
    version: 3,
    cartFingerprint,
    shippingAmountCents,
    parcelRateIds,
    carrier,
    serviceToken,
    issuedAt: now,
    expiresAt: now + TTL_SECONDS * 1000
  }

  const encoded = encode(payload)
  const signature = sign(encoded, getSecret())

  return `${encoded}.${signature}`
}

export const verifyV3SignedQuote = ({
  token,
  cartFingerprint,
  now = Date.now()
}) => {
  try {
    if (
      typeof token !== "string" ||
      typeof cartFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(cartFingerprint) ||
      !Number.isSafeInteger(now) ||
      now < 0
    ) {
      return null
    }

    const parts = token.split(".")

    if (parts.length !== 2) return null

    const [encoded, received] = parts
    const expected = sign(encoded, getSecret())

    const receivedBuffer = Buffer.from(received, "base64url")
    const expectedBuffer = Buffer.from(expected, "base64url")

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return null
    }

    const payload = decode(encoded)

    if (
      payload.version !== 3 ||
      payload.cartFingerprint !== cartFingerprint ||
      !Number.isSafeInteger(payload.shippingAmountCents) ||
      payload.shippingAmountCents <= 0 ||
      !Array.isArray(payload.parcelRateIds) ||
      payload.parcelRateIds.length < 1 ||
      payload.parcelRateIds.length > 10 ||
      !payload.parcelRateIds.every(id => typeof id === "string" && id.length > 0) ||
      new Set(payload.parcelRateIds).size !== payload.parcelRateIds.length ||
      !["USPS", "UPS"].includes(payload.carrier) ||
      typeof payload.serviceToken !== "string" ||
      !/^(usps|ups)_[a-z0-9_]+$/.test(payload.serviceToken) ||
      !payload.serviceToken.startsWith(payload.carrier.toLowerCase() + "_") ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt - payload.issuedAt !== TTL_SECONDS * 1000 ||
      now < payload.issuedAt ||
      now >= payload.expiresAt
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}