import mongoose from "mongoose"
import {
  createV3CheckoutReference
} from "./smartShippingV3CheckoutReference.js"

// Pure request construction only.
//
// Accepts trusted server-side values.
// Does not contact Square or write to MongoDB.
//
// A caller must separately establish durable
// request ownership before any Square API call.

export const buildV3SquarePaymentLinkRequest = ({
  orderId,
  amountCents,
  idempotencyKey,
  checkoutReferenceId,
  locationId,
  redirectUrl
}) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("Invalid V3 Square order ID.")
  }

  const canonicalReference = createV3CheckoutReference({
    orderId
  })

  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    typeof idempotencyKey !== "string" ||
    !idempotencyKey.startsWith("signavi-v3-sandbox-") ||
    checkoutReferenceId !== canonicalReference ||
    typeof locationId !== "string" ||
    !locationId.trim() ||
    typeof redirectUrl !== "string"
  ) {
    throw new Error(
      "Invalid trusted V3 Square payment-link inputs."
    )
  }

  let redirect

  try {
    redirect = new URL(redirectUrl)
  } catch {
    throw new Error("Invalid V3 checkout redirect URL.")
  }

  const id = String(orderId)

  // Only the configured SignaVi storefront success
  // destination for this exact order is permitted.
  if (
    redirect.protocol !== "https:" ||
    redirect.hostname !== "signavi.store" ||
    redirect.port ||
    redirect.username ||
    redirect.password ||
    redirect.hash ||
    redirect.search ||
    redirect.pathname !== `/success/${id}`
  ) {
    throw new Error("Untrusted V3 checkout redirect URL.")
  }

  return {
    idempotencyKey,
    order: {
      locationId: locationId.trim(),
      referenceId: canonicalReference,
      note: `SignaVi V3 Sandbox Order ${id}`,
      lineItems: [
        {
          name: `SignaVi Order ${id}`,
          quantity: "1",
          basePriceMoney: {
            amount: BigInt(amountCents),
            currency: "USD"
          }
        }
      ]
    },
    checkoutOptions: {
      redirectUrl,
      askForShippingAddress: false
    }
  }
}