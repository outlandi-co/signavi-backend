import {
  buildV3SquarePaymentLinkRequest
} from "./smartShippingV3SquarePaymentLinkRequest.js"

import {
  classifyV3SquareCreationOutcome
} from "./smartShippingV3CreationOutcome.js"

// Internal executor boundary, NOT a checkout route.
// Injected dependencies must be provided by trusted
// server-side wiring, never browser/client data.
//
// A claim is consumed before an external request.
// Any error remains reconciliation_required.
// No retry occurs inside this function.

export const executeV3GuardedSandboxCreation = async ({
  orderId,
  owner,
  expectedMerchantId,
  expectedLocationId,
  verifyIdentity,
  claimAttempt,
  createPaymentLink
}) => {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true" ||
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !== "true"
  ) {
    throw new Error("V3 Square Sandbox creation disabled.")
  }

  if (
    !orderId ||
    !owner ||
    !expectedMerchantId ||
    !expectedLocationId ||
    typeof verifyIdentity !== "function" ||
    typeof claimAttempt !== "function" ||
    typeof createPaymentLink !== "function"
  ) {
    throw new Error("Invalid guarded Square execution dependencies.")
  }

  // Verification occurs before consuming the durable claim.
  const identity = await verifyIdentity()

  if (
    identity?.verified !== true ||
    identity.squareRequestAuthorized !== false ||
    identity.merchantId !== expectedMerchantId ||
    identity.locationId !== expectedLocationId
  ) {
    throw new Error("Square Sandbox identity verification rejected.")
  }

  // Production wiring must use the existing ownership-fenced
  // claimV3SquareCreationAttempt against persisted MongoDB data.
  const claim = await claimAttempt()

  if (
    claim?.claimed !== true ||
    String(claim.orderId) !== String(orderId) ||
    claim.squareRequestAuthorized !== false ||
    claim.paymentCreated !== false ||
    !claim.claimedAt
  ) {
    throw new Error("Durable creation claim rejected.")
  }

  // Build only from trusted claim data.
  // If construction fails, the consumed claim is NOT reset.
  const request = buildV3SquarePaymentLinkRequest({
    orderId,
    amountCents: claim.amountCents,
    idempotencyKey: claim.idempotencyKey,
    checkoutReferenceId: claim.checkoutReferenceId,
    locationId: expectedLocationId,
    redirectUrl: `https://signavi.store/success/${orderId}`
  })

  try {
    // ONE invocation. Never inside MongoDB transaction.
    const response = await createPaymentLink(request)

    return classifyV3SquareCreationOutcome({ response })
  } catch {
    // A timeout may mean Square created the link.
    // Do not clear the durable claim or retry.
    return classifyV3SquareCreationOutcome({
      error: new Error("Square creation result uncertain.")
    })
  }
}