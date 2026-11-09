import {
  isStudioStorefrontRecoveryEligible
} from "./isStudioStorefrontRecoveryEligible.mjs"

const DENIED = Object.freeze({
  recovered: false
})

// This service does not create orders, change order state,
// or initiate a payment. The HTTP adapter must provide a
// trusted client identity and the original order fingerprint.
export async function recoverStudioStorefrontCheckout({
  attemptKey,
  recoverySecret,
  requestedFingerprint,
  clientKey,
  checkThrottle,
  findOrder,
  issueGuestToken,
  now = Date.now()
}) {
  if (
    typeof attemptKey !== "string" ||
    !attemptKey.trim() ||
    attemptKey.length > 128 ||
    typeof recoverySecret !== "string" ||
    !recoverySecret.trim() ||
    recoverySecret.length > 512 ||
    typeof requestedFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/i.test(requestedFingerprint) ||
    typeof clientKey !== "string" ||
    !clientKey.trim() ||
    typeof checkThrottle !== "function" ||
    typeof findOrder !== "function" ||
    typeof issueGuestToken !== "function" ||
    !Number.isSafeInteger(now)
  ) {
    return DENIED
  }

  try {
    // The shared throttle runs before any order lookup.
    const throttle = await checkThrottle({
      clientKey,
      attemptKey
    })

    if (throttle?.allowed !== true) {
      return DENIED
    }

    const order = await findOrder(attemptKey)

    if (
      !isStudioStorefrontRecoveryEligible({
        order,
        attemptKey,
        recoverySecret,
        requestedFingerprint,
        now
      })
    ) {
      return DENIED
    }

    const orderId = String(order?._id || "")

    if (!/^[a-f0-9]{24}$/i.test(orderId)) {
      return DENIED
    }

    // Token issuance is reached only after throttle,
    // Studio eligibility, and ownership authorization.
    const checkoutToken = await issueGuestToken(order)

    if (
      typeof checkoutToken !== "string" ||
      !checkoutToken.trim()
    ) {
      return DENIED
    }

    return {
      recovered: true,
      orderId,
      checkoutToken
    }
  } catch {
    return DENIED
  }
}
