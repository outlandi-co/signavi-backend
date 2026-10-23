import {
  lookupV3SquarePaymentLink
} from "./smartShippingV3SquareLookup.js"

// Verification-and-recording orchestration only.
//
// The caller must provide trusted, persisted expectations
// and an ownership-fenced recording callback.
//
// The supplied client must expose READ-ONLY Square methods.
// No payment creation occurs here.
//
// A recorded payment link is NOT a paid order.

export const verifyAndRecordV3SquareLink = async ({
  client,
  expectedPaymentLinkId,
  expectedAmountCents,
  expectedReferenceId,
  expectedLocationId,
  recordVerifiedLink
}) => {
  if (typeof recordVerifiedLink !== "function") {
    throw new Error("V3 verified recording callback required.")
  }

  const verified = await lookupV3SquarePaymentLink({
    client,
    expectedPaymentLinkId,
    expectedAmountCents,
    expectedReferenceId,
    expectedLocationId
  })

  if (
    verified?.verified !== true ||
    verified.checkoutReferenceVerified !== true ||
    verified.amountCents !== expectedAmountCents ||
    verified.squarePaymentLinkId !== expectedPaymentLinkId ||
    typeof verified.squareOrderId !== "string" ||
    !verified.squareOrderId.trim() ||
    typeof verified.paymentUrl !== "string" ||
    !verified.paymentUrl.trim()
  ) {
    throw new Error("V3 Square association not verified.")
  }

  // Only invoked AFTER read-only Square verification.
  // Production wiring must enforce the persisted operation,
  // same merchant/location identity, and lock ownership.
  const recorded = await recordVerifiedLink({
    paymentUrl: verified.paymentUrl,
    squarePaymentLinkId: verified.squarePaymentLinkId,
    squareOrderId: verified.squareOrderId
  })

  if (!recorded) {
    throw new Error("V3 verified Square recording rejected.")
  }

  return Object.freeze({
    verified: true,
    paymentLinkRecorded: true,
    customerPaymentConfirmed: false
  })
}