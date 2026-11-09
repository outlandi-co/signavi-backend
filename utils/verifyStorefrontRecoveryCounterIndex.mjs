export const STOREFRONT_RECOVERY_COUNTER_COLLECTION =
  "storefront_recovery_rate_limits"

export const STOREFRONT_RECOVERY_TTL_INDEX = {
  key: { expiresAt: 1 },
  name: "storefront_recovery_expires_ttl_v1",
  expireAfterSeconds: 0
}

export async function verifyStorefrontRecoveryCounterIndex({
  listIndexes
}) {
  if (typeof listIndexes !== "function") {
    return {
      ready: false,
      reason: "index-reader-unavailable"
    }
  }

  try {
    const indexes = await listIndexes()

    if (!Array.isArray(indexes)) {
      return {
        ready: false,
        reason: "invalid-index-result"
      }
    }

    const matches = indexes.filter(index =>
      index?.name ===
        STOREFRONT_RECOVERY_TTL_INDEX.name
    )

    if (matches.length !== 1) {
      return {
        ready: false,
        reason: "required-index-missing"
      }
    }

    const index = matches[0]

    if (
      index.key?.expiresAt !== 1 ||
      Object.keys(index.key).length !== 1 ||
      index.expireAfterSeconds !== 0 ||
      index.unique === true ||
      index.sparse === true ||
      index.partialFilterExpression != null
    ) {
      return {
        ready: false,
        reason: "index-definition-mismatch"
      }
    }

    return {
      ready: true,
      reason: "ready"
    }
  } catch {
    return {
      ready: false,
      reason: "index-inspection-failed"
    }
  }
}
