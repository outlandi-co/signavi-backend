import {
  prepareStorefrontCreationAttempt
} from "./prepareStorefrontCreationAttempt.mjs"

import {
  authorizeStoredStorefrontRecovery
} from "./authorizeStoredStorefrontRecovery.mjs"

const DENIED = Object.freeze({
  state: "denied",
  mayCreateOrder: false,
  mayIssueGuestToken: false,
  mayExecutePayment: false
})

// Offline orchestration contract.
// A future database adapter MUST enforce atomic uniqueness.
// An eligible recovery decision is NOT authorization to issue a token.
export async function resolvePreCatalogStorefrontAttempt({
  request,
  attemptKey,
  recoverySecret,
  findByAttemptKey,
  now = Date.now()
}) {
  if (typeof findByAttemptKey !== "function") {
    return DENIED
  }

  let metadata

  try {
    metadata = prepareStorefrontCreationAttempt({
      request,
      attemptKey,
      recoverySecret,
      now
    })
  } catch {
    return DENIED
  }

  let existing

  try {
    existing = await findByAttemptKey(
      metadata.storefrontCreationAttemptKey
    )
  } catch {
    return DENIED
  }

  if (existing == null) {
    return {
      state: "requires-atomic-create",
      metadata,
      mayCreateOrder: false,
      mayIssueGuestToken: false,
      mayExecutePayment: false
    }
  }

  const decision = authorizeStoredStorefrontRecovery({
    order: existing,
    attemptKey,
    recoverySecret,
    requestedFingerprint:
      metadata.storefrontCreationFingerprint,
    now
  })

  if (!decision.authorized) {
    return DENIED
  }

  return {
    state: "existing-eligible-for-further-authorization",
    mayCreateOrder: false,
    mayIssueGuestToken: false,
    mayExecutePayment: false
  }
}