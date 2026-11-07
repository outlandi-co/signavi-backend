import {
  createHash,
  randomBytes,
  timingSafeEqual
} from "node:crypto"

import {
  parseStorefrontAttemptKey
} from "./storefrontOrderIdempotency.mjs"

const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/
const DOMAIN = "signavi-storefront-recovery-v1"

export function createStorefrontRecoverySecret() {
  return randomBytes(32).toString("base64url")
}

export function hashStorefrontRecoveryProof({
  attemptKey,
  recoverySecret
}) {
  const key = parseStorefrontAttemptKey(attemptKey)

  if (
    !key ||
    typeof recoverySecret !== "string" ||
    !SECRET_PATTERN.test(recoverySecret)
  ) {
    throw new Error("Invalid storefront recovery proof.")
  }

  const secretBytes = Buffer.from(
    recoverySecret,
    "base64url"
  )

  if (
    secretBytes.length !== 32 ||
    secretBytes.toString("base64url") !== recoverySecret
  ) {
    throw new Error("Invalid storefront recovery proof.")
  }

  return createHash("sha256")
    .update(DOMAIN)
    .update(":")
    .update(key)
    .update(":")
    .update(secretBytes)
    .digest("hex")
}

export function verifyStorefrontRecoveryProof({
  attemptKey,
  recoverySecret,
  storedHash
}) {
  try {
    if (
      typeof storedHash !== "string" ||
      !HASH_PATTERN.test(storedHash)
    ) {
      return false
    }

    const computed = hashStorefrontRecoveryProof({
      attemptKey,
      recoverySecret
    })

    return timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(storedHash, "hex")
    )
  } catch {
    return false
  }
}