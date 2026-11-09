import {
  recoverStudioStorefrontCheckout
} from "./recoverStudioStorefrontCheckout.mjs"

import {
  fingerprintPreCatalogStorefrontOrder
} from "./storefrontPreCatalogFingerprint.mjs"

// Injectable handler. This file does not mount a route,
// connect to MongoDB, or initiate payment.
export function createStudioRecoveryHttpHandler({
  checkThrottle,
  findOrder,
  issueGuestToken
}) {
  if (
    typeof checkThrottle !== "function" ||
    typeof findOrder !== "function" ||
    typeof issueGuestToken !== "function"
  ) {
    throw new Error("Studio recovery dependencies unavailable.")
  }

  return async function studioRecoveryHttpHandler(req, res) {
    const deny = () => res.status(403).json({
      success: false,
      message: "Checkout recovery could not be authorized."
    })

    try {
      const originalRequest = req.body?.originalRequest

      if (
        !originalRequest ||
        typeof originalRequest !== "object" ||
        Array.isArray(originalRequest)
      ) {
        return deny()
      }

      const attemptKey = req.get(
        "x-signavi-storefront-attempt-key"
      )

      const recoverySecret = req.get(
        "x-signavi-storefront-recovery-secret"
      )

      // Never accept X-Forwarded-For directly from the caller.
      const clientKey = req.socket?.remoteAddress

      const requestedFingerprint =
        fingerprintPreCatalogStorefrontOrder(originalRequest)

      const decision = await recoverStudioStorefrontCheckout({
        attemptKey,
        recoverySecret,
        requestedFingerprint,
        clientKey,
        checkThrottle,
        findOrder,
        issueGuestToken
      })

      if (decision.recovered !== true) {
        return deny()
      }

      return res.status(200).json({
        success: true,
        orderId: decision.orderId,
        checkoutToken: decision.checkoutToken
      })
    } catch {
      return deny()
    }
  }
}
