import {
  STOREFRONT_RECOVERY_TTL_INDEX,
  verifyStorefrontRecoveryCounterIndex
} from "./verifyStorefrontRecoveryCounterIndex.mjs"

// Plans only. Never creates indexes or mutates MongoDB.
export async function planStorefrontRecoveryCounterMigration({
  listIndexes
}) {
  if (typeof listIndexes !== "function") {
    return {
      safe: false,
      action: "stop",
      reason: "index-reader-unavailable"
    }
  }

  let indexes

  try {
    indexes = await listIndexes()
  } catch {
    return {
      safe: false,
      action: "stop",
      reason: "inspection-failed"
    }
  }

  if (!Array.isArray(indexes)) {
    return {
      safe: false,
      action: "stop",
      reason: "invalid-index-result"
    }
  }

  const readiness =
    await verifyStorefrontRecoveryCounterIndex({
      listIndexes: async () => indexes
    })

  if (readiness.ready === true) {
    return {
      safe: true,
      action: "none",
      reason: "index-ready"
    }
  }

  const expected = STOREFRONT_RECOVERY_TTL_INDEX

  const conflicting = indexes.some(index => {
    if (!index || typeof index !== "object") {
      return true
    }

    if (index.name === expected.name) {
      return true
    }

    // Do not automatically provision an index when
    // another index already targets expiresAt.
    return (
      index.key?.expiresAt !== undefined
    )
  })

  if (conflicting) {
    return {
      safe: false,
      action: "stop",
      reason: "index-conflict"
    }
  }

  return {
    safe: true,
    action: "provision-required",
    reason: "index-missing",
    specification: {
      key: { ...expected.key },
      name: expected.name,
      expireAfterSeconds: expected.expireAfterSeconds
    }
  }
}
