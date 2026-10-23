import {
  verifyV3SquarePaymentLink
} from "./smartShippingV3SquareVerifier.js"

const allowedHosts = new Set([
  "square.link",
  "checkout.square.site"
])

const nonempty = value =>
  typeof value === "string" &&
  value.length > 0 &&
  value === value.trim()

// This function is intentionally stricter than the
// basic Square link verifier.
//
// expectedReferenceId must come from a trusted,
// persisted SignaVi checkout record.
//
// The future V3 Square creation request must write
// the exact same reference_id into its Square order.
//
// This function makes no API requests or DB writes.
// A match does not prove that the buyer has paid.

export const verifyV3SquareCheckoutAssociation = ({
  expectedPaymentLinkId,
  expectedAmountCents,
  expectedReferenceId,
  paymentLink,
  squareOrder
}) => {
  if (!nonempty(expectedReferenceId)) {
    throw new Error(
      "Trusted V3 checkout reference is required."
    )
  }

  const verified = verifyV3SquarePaymentLink({
    expectedPaymentLinkId,
    expectedAmountCents,
    paymentLink,
    squareOrder
  })

  const actualReference =
    squareOrder.referenceId ??
    squareOrder.reference_id

  if (actualReference !== expectedReferenceId) {
    throw new Error(
      "Square checkout reference mismatch."
    )
  }

  let url

  try {
    url = new URL(verified.paymentUrl)
  } catch {
    throw new Error(
      "Untrusted Square checkout URL."
    )
  }

  if (
    url.protocol !== "https:" ||
    !allowedHosts.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      "Untrusted Square checkout URL."
    )
  }

  return {
    ...verified,
    checkoutReferenceVerified: true,
    checkoutReferenceId: expectedReferenceId
  }
}