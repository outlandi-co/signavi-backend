import {
  buildV3SquarePaymentLinkRequest
} from "./smartShippingV3SquarePaymentLinkRequest.js"

import {
  classifyV3SquareCreationOutcome
} from "./smartShippingV3CreationOutcome.js"

// Offline test harness ONLY.
// No Square SDK import, credentials, or network client.
// Deliberately unavailable outside NODE_ENV=test.
// This is not production authorization.

export const attemptV3MockSquareCreation = async ({
  reservation,
  orderId,
  locationId,
  createPaymentLink
}) => {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox"
  ) {
    throw new Error("V3 mock creation requires isolated test mode.")
  }

  if (
    reservation?.requestReserved !== true ||
    reservation.status !== "reconciliation_required" ||
    reservation.environment !== "sandbox" ||
    reservation.merchantIdentityVerified !== true ||
    reservation.squareRequestAuthorized !== false ||
    reservation.paymentCreated !== false ||
    reservation.locationId !== locationId ||
    typeof createPaymentLink !== "function"
  ) {
    throw new Error("V3 mock creation prerequisites rejected.")
  }

  const request = buildV3SquarePaymentLinkRequest({
    orderId,
    amountCents: reservation.amountCents,
    idempotencyKey: reservation.idempotencyKey,
    checkoutReferenceId: reservation.checkoutReferenceId,
    locationId,
    redirectUrl: `https://signavi.store/success/${orderId}`
  })

  try {
    // Exactly one injected mock invocation.
    // No automatic retry on failures.
    const response = await createPaymentLink(request)

    return classifyV3SquareCreationOutcome({ response })
  } catch {
    return classifyV3SquareCreationOutcome({
      error: new Error("Mock creation result uncertain.")
    })
  }
}