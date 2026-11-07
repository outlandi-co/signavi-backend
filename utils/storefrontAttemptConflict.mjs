import { classifyStorefrontAttempt } from "./storefrontOrderIdempotency.mjs"

const FIELD = "storefrontCreationAttemptKey"
const INDEX = "unique_storefront_creation_attempt_v1"

export const isStorefrontAttemptDuplicate = (error) => {
  if (!error || error.code !== 11000) return false

  const pattern = error.keyPattern

  return Boolean(
    pattern &&
    typeof pattern === "object" &&
    !Array.isArray(pattern) &&
    Object.keys(pattern).length === 1 &&
    pattern[FIELD] === 1 &&
    (
      error.index === INDEX ||
      error.indexName === INDEX ||
      (typeof error.message === "string" &&
        error.message.includes(INDEX))
    )
  )
}

export const resolveStorefrontAttemptConflict = ({
  error,
  existingFingerprint,
  requestedFingerprint
}) => {
  if (!isStorefrontAttemptDuplicate(error)) {
    return {
      status: "database-error",
      httpStatus: 503,
      mayCreateAnotherOrder: false,
      mayRevealOrder: false
    }
  }

  const classification = classifyStorefrontAttempt({
    existingFingerprint,
    requestedFingerprint
  })

  if (classification === "same-attempt") {
    return {
      status: "existing-attempt-requires-auth",
      httpStatus: 409,
      mayCreateAnotherOrder: false,
      mayRevealOrder: false
    }
  }

  return {
    status: "attempt-conflict",
    httpStatus: 409,
    mayCreateAnotherOrder: false,
    mayRevealOrder: false
  }
}