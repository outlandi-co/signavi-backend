
import crypto from "node:crypto"

const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

const getSecret = () => {
  const hex = String(
    process.env.SHIPPING_QUOTE_SECRET || ""
  ).trim()

  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    throw new Error("Guest checkout signing key is missing.")
  }

  return Buffer.from(hex, "hex")
}

const getOrderId = (order) => {
  const id = String(order?._id || "").toLowerCase()

  if (!/^[a-f0-9]{24}$/.test(id)) {
    throw new Error("Invalid checkout order.")
  }

  return id
}

const sign = (payload) =>
  crypto
    .createHmac("sha256", getSecret())
    .update(`signavi-guest-checkout:${payload}`)
    .digest("base64url")

export function createGuestCheckoutToken(order) {
  const id = getOrderId(order)
  const expires = Date.now() + TOKEN_LIFETIME_MS
  const nonce = crypto.randomBytes(16).toString("base64url")
  const payload = `v1:${id}:${expires}:${nonce}`

  return `${payload}.${sign(payload)}`
}

export function verifyGuestCheckoutToken(order, token) {
  try {
    if (typeof token !== "string" || token.length > 400) {
      return false
    }

    const parts = token.split(".")
    if (parts.length !== 2) return false

    const [payload, signature] = parts
    const fields = payload.split(":")

    if (fields.length !== 4) return false

    const [version, id, expiration, nonce] = fields

    if (version !== "v1") return false
    if (id !== getOrderId(order)) return false
    if (!/^\d{13}$/.test(expiration)) return false
    if (!/^[A-Za-z0-9_-]{22}$/.test(nonce)) return false

    const remaining = Number(expiration) - Date.now()

    if (
      remaining <= 0 ||
      remaining > TOKEN_LIFETIME_MS + 60000
    ) {
      return false
    }

    const expected = Buffer.from(sign(payload), "base64url")
    const received = Buffer.from(signature, "base64url")

    return (
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
    )
  } catch {
    return false
  }
}
