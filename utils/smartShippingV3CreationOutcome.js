const allowedHosts = new Set([
  "square.link",
  "sandbox.square.link",
  "checkout.square.site"
])

const nonempty = value =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0

// Pure classification of a Square payment-link creation result.
//
// Does not contact Square, write to MongoDB, or authorize
// a payment. A valid-looking response MUST subsequently
// be verified by retrieving the Square link and order.
//
// An exception or incomplete response means that Square
// may have created a link. Never blindly retry.

export const classifyV3SquareCreationOutcome = ({
  response,
  error
} = {}) => {
  const uncertain = reason => Object.freeze({
    status: "reconciliation_required",
    reason,
    safeToRetryCreation: false,
    paymentCreated: "unknown",
    verified: false
  })

  if (error !== undefined && error !== null) {
    return uncertain("square_creation_outcome_unknown")
  }

  const link =
    response?.paymentLink ?? response?.payment_link

  const id = link?.id
  const orderId = link?.orderId ?? link?.order_id
  const paymentUrl = link?.url

  if (
    !nonempty(id) ||
    !nonempty(orderId) ||
    !nonempty(paymentUrl)
  ) {
    return uncertain("square_creation_response_incomplete")
  }

  let url
  try {
    url = new URL(paymentUrl)
  } catch {
    return uncertain("square_creation_url_invalid")
  }

  if (
    url.protocol !== "https:" ||
    !allowedHosts.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    return uncertain("square_creation_url_untrusted")
  }

  return Object.freeze({
    status: "lookup_required",
    reason: "square_creation_identifiers_received",
    squarePaymentLinkId: id,
    squareOrderId: orderId,
    paymentUrl,
    safeToRetryCreation: false,
    paymentCreated: "unconfirmed",
    verified: false
  })
}