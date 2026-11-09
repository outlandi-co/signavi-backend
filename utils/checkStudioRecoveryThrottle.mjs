import {
  createMongoStorefrontRecoveryCounter
} from "./createMongoStorefrontRecoveryCounter.mjs"

import {
  evaluateStorefrontRecoveryRateLimit
} from "./evaluateStorefrontRecoveryRateLimit.mjs"

import {
  verifyStorefrontRecoveryCounterIndex
} from "./verifyStorefrontRecoveryCounterIndex.mjs"

const DENIED = Object.freeze({
  allowed: false
})

export async function checkStudioRecoveryThrottle({
  collection,
  clientKey,
  attemptKey
}) {
  if (
    !collection ||
    typeof collection.listIndexes !== "function" ||
    typeof clientKey !== "string" ||
    !clientKey.trim() ||
    typeof attemptKey !== "string" ||
    !attemptKey.trim()
  ) {
    return DENIED
  }

  try {
    const readiness = await verifyStorefrontRecoveryCounterIndex({
      listIndexes: () =>
        collection.listIndexes().toArray()
    })

    if (readiness.ready !== true) {
      return DENIED
    }

    const increment =
      createMongoStorefrontRecoveryCounter({
        collection
      })

    // Shared client budget limits attempts across
    // many different checkout attempt keys.
    const clientDecision =
      await evaluateStorefrontRecoveryRateLimit({
        key: `client:${clientKey}`,
        increment,
        limit: 20,
        windowMs: 15 * 60 * 1000
      })

    if (!clientDecision.allowed) {
      return DENIED
    }

    // Independent budget for one checkout attempt.
    const attemptDecision =
      await evaluateStorefrontRecoveryRateLimit({
        key: `attempt:${attemptKey}`,
        increment,
        limit: 5,
        windowMs: 15 * 60 * 1000
      })

    if (!attemptDecision.allowed) {
      return DENIED
    }

    return { allowed: true }
  } catch {
    return DENIED
  }
}
