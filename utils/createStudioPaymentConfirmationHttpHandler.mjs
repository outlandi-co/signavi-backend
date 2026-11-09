import {
  buildStudioPaymentStatusProjection
} from "./buildStudioPaymentStatusProjection.mjs"

const OBJECT_ID = /^[a-f0-9]{24}$/i

export function createStudioPaymentConfirmationHttpHandler({
  findOrder,
  verifyGuestToken
} = {}) {
  if (
    typeof findOrder !== "function" ||
    typeof verifyGuestToken !== "function"
  ) {
    throw new TypeError("STUDIO_CONFIRMATION_DEPENDENCIES_REQUIRED")
  }

  return async function studioPaymentConfirmation(req, res) {
    res.set("Cache-Control", "no-store")

    const deny = () => res.status(403).json({
      success: false,
      message: "Payment confirmation unavailable."
    })

    const id = String(req?.params?.id ?? "")
    const guestToken = String(
      req?.get?.("x-signavi-guest-checkout-token") ?? ""
    )
    const attemptKey = String(
      req?.get?.("x-signavi-storefront-attempt-key") ?? ""
    )

    if (
      !OBJECT_ID.test(id) ||
      !guestToken ||
      guestToken.length > 2048 ||
      !attemptKey ||
      attemptKey.length > 100
    ) {
      return deny()
    }

    let order

    try {
      order = await findOrder(id)
    } catch {
      return res.status(503).json({
        success: false,
        message: "Payment confirmation temporarily unavailable."
      })
    }

    if (!order) return deny()

    // The guest credential is required independently of the
    // checkout attempt key. An attempt key alone grants no access.
    let authorized = false

    try {
      authorized = await verifyGuestToken(order, guestToken) === true
    } catch {
      authorized = false
    }

    if (!authorized) return deny()

    try {
      const projection = buildStudioPaymentStatusProjection(
        order,
        attemptKey
      )

      if (projection.orderId.toLowerCase() !== id.toLowerCase()) {
        return deny()
      }

      return res.status(200).json({
        success: true,
        data: projection
      })
    } catch {
      return deny()
    }
  }
}