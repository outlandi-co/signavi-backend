export async function evaluateStorefrontRecoveryRateLimit({
  key,
  increment,
  limit = 5,
  windowMs = 15 * 60 * 1000
}) {
  if (
    typeof key !== "string" ||
    !key.trim() ||
    typeof increment !== "function" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    !Number.isSafeInteger(windowMs) ||
    windowMs < 1000
  ) {
    return {
      allowed: false,
      reason: "invalid-configuration"
    }
  }

  try {
    // The adapter must atomically increment and expire
    // counters in shared storage.
    const result = await increment({
      key,
      windowMs
    })

    if (
      !result ||
      !Number.isSafeInteger(result.count) ||
      result.count < 1
    ) {
      return {
        allowed: false,
        reason: "invalid-counter"
      }
    }

    return {
      allowed: result.count <= limit,
      reason:
        result.count <= limit
          ? "allowed"
          : "rate-limited"
    }
  } catch {
    // Fail closed when shared storage is unavailable.
    return {
      allowed: false,
      reason: "storage-unavailable"
    }
  }
}
