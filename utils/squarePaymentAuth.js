
import crypto from "node:crypto"

const TOKEN_LIFETIME_MS = 90_000

const getSecret = () => {
  const hex = String(
    process.env.SHIPPING_QUOTE_SECRET || ""
  ).trim()

  if (!/^[0-9a-f]{64,}$/i.test(hex)) {
    throw new Error(
      "Private checkout signing key is not configured."
    )
  }

  return Buffer.from(hex, "hex")
}

const getOrderDetails = (order) => {
  const id = String(order?._id || "").toLowerCase()
  const total = Number(order?.finalPrice)
  const amountCents = Math.round(total * 100)

  if (
    !/^[a-f0-9]{24}$/.test(id) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isSafeInteger(amountCents)
  ) {
    throw new Error("Invalid order for payment.")
  }

  return { id, amountCents }
}

const sign = (data) =>
  crypto
    .createHmac("sha256", getSecret())
    .update(`signavi-square-checkout:${data}`)
    .digest("base64url")

export function createSquareAuthorization(order) {
  const { id, amountCents } = getOrderDetails(order)
  const issuedAt = Date.now()

  const data = [
    "v1",
    issuedAt,
    id,
    amountCents
  ].join(":")

  return `${data}.${sign(data)}`
}

export function verifySquareAuthorization(order, token) {
  try {
    if (typeof token !== "string" || token.length > 256) {
      return false
    }

    const parts = token.split(".")
    if (parts.length !== 2) return false

    const [data, signature] = parts
    const [version, timestamp, id, cents] = data.split(":")

    if (version !== "v1") return false
    if (!/^\d{13}$/.test(timestamp)) return false
    if (!/^\d+$/.test(cents)) return false

    const age = Date.now() - Number(timestamp)

    if (age < -15000 || age > TOKEN_LIFETIME_MS) {
      return false
    }

    const expectedOrder = getOrderDetails(order)

    if (
      id !== expectedOrder.id ||
      Number(cents) !== expectedOrder.amountCents
    ) {
      return false
    }

    const expected = Buffer.from(
      sign(data),
      "base64url"
    )

    const received = Buffer.from(
      signature,
      "base64url"
    )

    return (
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
    )
  } catch {
    return false
  }
}
