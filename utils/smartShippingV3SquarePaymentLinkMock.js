import {
  buildV3SquarePaymentLinkRequest
} from "./smartShippingV3SquarePaymentLinkRequest.js"

// Test-only adapter. No SDK, HTTP client, credentials,
// external requests, or database access.
//
// The mock deliberately models Square's response
// but does NOT establish merchant ownership or payment.

export const simulateV3SquarePaymentLink = ({
  trustedInputs,
  simulatedResponse
}) => {
  if (
    !trustedInputs ||
    !simulatedResponse ||
    typeof simulatedResponse !== "object"
  ) {
    throw new Error("Invalid V3 Square mock inputs.")
  }

  const request = buildV3SquarePaymentLinkRequest(
    trustedInputs
  )

  const link = simulatedResponse.paymentLink

  if (
    !link ||
    typeof link.id !== "string" ||
    !link.id.trim() ||
    typeof link.orderId !== "string" ||
    !link.orderId.trim() ||
    typeof link.url !== "string"
  ) {
    throw new Error(
      "Incomplete simulated Square payment-link response."
    )
  }

  const url = new URL(link.url)

  if (
    url.protocol !== "https:" ||
    !["square.link", "checkout.square.site"].includes(
      url.hostname
    ) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      "Untrusted simulated Square payment URL."
    )
  }

  return Object.freeze({
    request,
    paymentLinkId: link.id,
    squareOrderId: link.orderId,
    paymentUrl: link.url,
    simulated: true,
    paymentCreated: false,
    squareRequestAuthorized: false,
    paymentVerified: false
  })
}