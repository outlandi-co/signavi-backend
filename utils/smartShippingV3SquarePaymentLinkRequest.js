import { assertV3SquareSafeReference } from "./smartShippingV3ReferenceIdentity.js"
import mongoose from "mongoose"
import {
  createV3CheckoutReference,
  createV3SquareSafeCheckoutReference
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
  redirectUrl,
  referenceFormat = "legacy"
}) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("Invalid V3 Square order ID.")
  }

  if (!["legacy", "square_safe"].includes(referenceFormat)) {
    throw new Error("Invalid V3 checkout reference format.")
  }

  const canonicalReference =
    referenceFormat === "square_safe"
      ? createV3SquareSafeCheckoutReference({ orderId })
      : createV3CheckoutReference({ orderId })

  if (referenceFormat === "square_safe") {
    if (canonicalReference.length > 40) {
      throw new Error("Square reference exceeds 40 characters.")
    }
    assertV3SquareSafeReference({
      orderId,
      referenceId: checkoutReferenceId
    })
  }

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
