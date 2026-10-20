
import crypto from "node:crypto"

const QUOTE_LIFETIME_MS = 15 * 60 * 1000

const shippingSecret = () => {
  const hex = String(
    process.env.SHIPPING_QUOTE_SECRET || ""
  ).trim()

  if (!/^[0-9a-f]{64,}$/i.test(hex)) {
    throw new Error(
      "SHIPPING_QUOTE_SECRET must be a secure hexadecimal key."
    )
  }

  return Buffer.from(hex, "hex")
}

const digest = (value) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")

const normalizedCart = (items) => {
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 100
  ) {
    throw new Error("Invalid shipping cart.")
  }

  const totals = new Map()

  for (const item of items) {
    const id = String(
      item?.productId ?? item?._id ?? item?.id ?? ""
    ).toLowerCase()

    const quantity = Number(item?.quantity)

    if (
      !/^[a-f0-9]{24}$/.test(id) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 500
    ) {
      throw new Error("Invalid shipping cart item.")
    }

    totals.set(
      id,
      (totals.get(id) || 0) + quantity
    )
  }

  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
}

const normalizedAddress = (address) => {
  const clean = (value) =>
    String(value ?? "").trim().toLowerCase()

  const result = {
    street: clean(
      address?.street1 ?? address?.street
    ),
    city: clean(address?.city),
    state: clean(address?.state),
    zip: clean(address?.zip),
    country: clean(address?.country || "US")
  }

  if (
    !result.street ||
    !result.city ||
    !result.state ||
    !result.zip ||
    !result.country
  ) {
    throw new Error("Incomplete shipping address.")
  }

  return result
}

const sign = (encoded) =>
  crypto
    .createHmac("sha256", shippingSecret())
    .update(encoded)
    .digest("base64url")

export function createShippingQuote({
  items,
  destination,
  rate,
  testMode = false
}) {
  const rateId = String(
    rate?.object_id ?? rate?.id ?? ""
  ).trim()

  const amount = Number(rate?.amount)
  const currency = String(
    rate?.currency || ""
  ).toUpperCase()

  if (
    !rateId ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 1000000 ||
    currency !== "USD"
  ) {
    throw new Error("Invalid Shippo rate.")
  }

  const now = Date.now()

  const payload = {
    version: 1,
    issuedAt: now,
    expiresAt: now + QUOTE_LIFETIME_MS,

    cartHash: digest(normalizedCart(items)),
    addressHash: digest(
      normalizedAddress(destination)
    ),

    rateId,
    amountCents: Math.round(amount * 100),
    currency: "USD",

    provider: String(
      rate?.provider || ""
    ).slice(0, 100),

    service: String(
      rate?.servicelevel?.name ||
      rate?.service ||
      ""
    ).slice(0, 100),

    testMode: Boolean(testMode)
  }

  const encoded = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url")

  return `${encoded}.${sign(encoded)}`
}

// Version 2: all constituent parcel rates are signed together.
export function createMultiParcelShippingQuote({
  items,
  destination,
  rates,
  testMode = false
}) {
  if (!Array.isArray(rates) || rates.length < 2 || rates.length > 10) {
    throw new Error("Invalid multi-parcel shipping rates.")
  }

  const parcelRates = rates.map((rate) => {
    const rateId = String(rate?.object_id || "").trim()
    const currency = String(rate?.currency || "").toUpperCase()
    const amount = Number(rate?.amount)
    const amountCents = Math.round(amount * 100)

    if (
      !rateId || rateId.length > 150 ||
      currency !== "USD" ||
      !Number.isFinite(amount) || amount <= 0 ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0
    ) {
      throw new Error("Invalid parcel shipping rate.")
    }

    return { rateId, amountCents }
  })

  const total = parcelRates.reduce((sum, rate) => sum + rate.amountCents, 0)
  if (!Number.isSafeInteger(total) || total <= 0 || total > 100000000) {
    throw new Error("Invalid combined shipping amount.")
  }

  const provider = String(rates[0].provider || "").slice(0, 100)
  const service = String(rates[0].servicelevel?.name || "").slice(0, 100)
  const serviceToken = String(rates[0].servicelevel?.token || "")
  const carrierAccount = String(rates[0].carrier_account || "")
  if (!provider || !service || !serviceToken || !carrierAccount ||
    rates.some((rate) =>
      String(rate.provider || "") !== provider ||
      String(rate.servicelevel?.token || "") !== serviceToken ||
      String(rate.carrier_account || "") !== carrierAccount
    )) {
    throw new Error("Parcel rates must use the same carrier service.")
  }

  const now = Date.now()
  const payload = {
    version: 2,
    issuedAt: now,
    expiresAt: now + QUOTE_LIFETIME_MS,
    cartHash: digest(normalizedCart(items)),
    addressHash: digest(normalizedAddress(destination)),
    rateIds: parcelRates.map((rate) => rate.rateId),
    parcelRates,
    amountCents: total,
    currency: "USD",
    provider,
    service,
    testMode: Boolean(testMode)
  }

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${encoded}.${sign(encoded)}`
}

export function verifyShippingQuote(
  token,
  {
    items,
    destination,
    allowTest = false
  }
) {
  if (
    typeof token !== "string" ||
    token.length > 8192
  ) {
    throw new Error("Invalid shipping quote.")
  }

  const parts = token.split(".")

  if (parts.length !== 2) {
    throw new Error("Invalid shipping quote.")
  }

  const [encoded, signature] = parts

  const expected = Buffer.from(
    sign(encoded),
    "base64url"
  )

  const received = Buffer.from(
    signature,
    "base64url"
  )

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    throw new Error(
      "Shipping quote signature is invalid."
    )
  }

  let quote

  try {
    quote = JSON.parse(
      Buffer.from(encoded, "base64url")
        .toString("utf8")
    )
  } catch {
    throw new Error("Invalid shipping quote data.")
  }

  const now = Date.now()

  if (
    ![1, 2].includes(quote.version) ||
    !Number.isSafeInteger(quote.issuedAt) ||
    !Number.isSafeInteger(quote.expiresAt) ||
    quote.issuedAt > now + 30000 ||
    quote.expiresAt <= now ||
    quote.expiresAt - quote.issuedAt >
      QUOTE_LIFETIME_MS
  ) {
    throw new Error(
      "Shipping quote has expired or is invalid."
    )
  }

  if (
    quote.cartHash !== digest(
      normalizedCart(items)
    )
  ) {
    throw new Error(
      "Cart changed. Request new shipping rates."
    )
  }

  if (
    quote.addressHash !== digest(
      normalizedAddress(destination)
    )
  ) {
    throw new Error(
      "Shipping address changed. Request new rates."
    )
  }

  if (quote.testMode && !allowTest) {
    throw new Error(
      "Test shipping rates cannot be used for live payment."
    )
  }

  if (
    quote.currency !== "USD" ||
    !Number.isSafeInteger(quote.amountCents) ||
    quote.amountCents <= 0 ||
    (quote.version === 1 && !quote.rateId)
  ) {
    throw new Error(
      "Invalid shipping quote amount."
    )
  }

  // Version 2 quotes must include every parcel rate, and the signed
  // total must exactly match the sum of the signed individual amounts.
  if (quote.version === 2) {
    if (!Array.isArray(quote.parcelRates) ||
      quote.parcelRates.length < 2 || quote.parcelRates.length > 10 ||
      !Array.isArray(quote.rateIds) ||
      quote.rateIds.length !== quote.parcelRates.length ||
      quote.parcelRates.some((rate, index) =>
        !rate || typeof rate.rateId !== "string" ||
        !rate.rateId.trim() || rate.rateId.length > 150 ||
        rate.rateId !== quote.rateIds[index] ||
        !Number.isSafeInteger(rate.amountCents) ||
        rate.amountCents <= 0
      ) ||
      quote.parcelRates.reduce((sum, rate) => sum + rate.amountCents, 0) !==
        quote.amountCents ||
      typeof quote.provider !== "string" || !quote.provider ||
      typeof quote.service !== "string" || !quote.service
    ) {
      throw new Error("Invalid multi-parcel shipping quote.")
    }
  }

  return {
    rateId: quote.version === 2 ? quote.rateIds[0] : quote.rateId,
    rateIds: quote.version === 2 ? quote.rateIds : [quote.rateId],
    parcelRates: quote.version === 2 ? quote.parcelRates : [{
      rateId: quote.rateId,
      amountCents: quote.amountCents
    }],
    amountCents: quote.amountCents,
    amount: quote.amountCents / 100,
    currency: quote.currency,
    provider: quote.provider,
    service: quote.service,
    testMode: quote.testMode,
    expiresAt: quote.expiresAt
  }
}
