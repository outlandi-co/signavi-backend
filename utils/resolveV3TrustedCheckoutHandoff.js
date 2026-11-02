const objectIdPattern = /^[0-9a-f]{24}$/

const blocked = (reason, httpStatus = 423) => Object.freeze({
  success: false,
  reason,
  httpStatus,
  retryAuthorized: false
})

export async function resolveV3TrustedCheckoutHandoff({
  activation,
  executeTrustedCheckout,
  redirectUrl
} = {}) {
  if (typeof executeTrustedCheckout !== "function") {
    return blocked("TRUSTED_SERVICE_REQUIRED", 503)
  }

  const id = String(activation?.orderId || "").toLowerCase()
  const expectedKey = `signavi-v3-production-purchase-${id}`

  if (
    activation?.ready !== true ||
    activation?.persistedAndVerified !== true ||
    !objectIdPattern.test(id) ||
    activation.purchaseKey !== expectedKey ||
    !Number.isSafeInteger(activation.amountCents) ||
    activation.amountCents < 1
  ) {
    return blocked("VERIFIED_ACTIVATION_REQUIRED")
  }

  let result

  try {
    result = await executeTrustedCheckout({
  orderId: id,
  amountCents: activation.amountCents,
  ...(redirectUrl === undefined ? {} : { redirectUrl })
})
  } catch {
    return blocked("TRUSTED_EXECUTION_OUTCOME_UNCERTAIN")
  }

  if (
    result?.status !== "link_recorded" ||
    result?.reason !== "PAYMENT_LINK_DURABLY_RECORDED" ||
    typeof result.paymentUrl !== "string"
  ) {
    return blocked("PAYMENT_LINK_NOT_VERIFIED")
  }

  let url

  try {
    url = new URL(result.paymentUrl)
  } catch {
    return blocked("INVALID_PAYMENT_URL")
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(
      url.hostname === "square.link" ||
      url.hostname === "squareup.com" ||
      url.hostname.endsWith(".squareup.com")
    )
  ) {
    return blocked("UNAPPROVED_PAYMENT_URL")
  }

  return Object.freeze({
    success: true,
    orderId: id,
    paymentUrl: url.href,
    retryAuthorized: false
  })
}