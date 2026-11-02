
export function createV3CheckoutHttpResponse(handoff) {
  if (handoff?.success !== true) {
    return Object.freeze({
      status: handoff?.httpStatus ?? 423,
      body: {
        success: false,
        code: "V3_CHECKOUT_NOT_READY",
        reason: handoff?.reason || "CHECKOUT_NOT_VERIFIED",
        paymentCreated: false,
        retryAuthorized: false
      }
    })
  }

  if (
    typeof handoff.orderId !== "string" ||
    !/^[0-9a-f]{24}$/.test(handoff.orderId) ||
    typeof handoff.paymentUrl !== "string" ||
    !handoff.paymentUrl
  ) {
    return Object.freeze({
      status: 423,
      body: {
        success: false,
        code: "V3_PAYMENT_LINK_INVALID",
        retryAuthorized: false
      }
    })
  }

  return Object.freeze({
    status: 200,
    body: {
      success: true,
      orderId: handoff.orderId,
      paymentUrl: handoff.paymentUrl,
      paymentCreated: true,
      paymentCompleted: false,
      retryAuthorized: false
    }
  })
}
