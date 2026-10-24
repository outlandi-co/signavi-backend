import {
  classifyV3SquareCreationOutcome
} from "./smartShippingV3CreationOutcome.js"

import {
  verifyAndRecordV3SquareLink
} from "./smartShippingV3VerifiedLinkRecording.js"

// Offline-testable response coordinator.
//
// This function NEVER calls Square paymentLinks.create.
// The response is supplied by a separate, future executor.
// Record only after independent Square link/order lookup.
// Do not retry creation on any failure.

export const processV3SquareCreationResponse = async ({
  response,
  error,
  client,
  expectedAmountCents,
  expectedReferenceId,
  expectedLocationId,
  recordVerifiedLink
}) => {
  const outcome = classifyV3SquareCreationOutcome({
    response,
    error
  })

  if (outcome.status !== "lookup_required") {
    return Object.freeze({
      ...outcome,
      paymentLinkRecorded: false,
      customerPaymentConfirmed: false
    })
  }

  try {
    const recorded = await verifyAndRecordV3SquareLink({
      client,
      expectedPaymentLinkId: outcome.squarePaymentLinkId,
      expectedAmountCents,
      expectedReferenceId,
      expectedLocationId,
      recordVerifiedLink: async data => {
        if (
          data.squarePaymentLinkId !== outcome.squarePaymentLinkId ||
          data.squareOrderId !== outcome.squareOrderId ||
          data.paymentUrl !== outcome.paymentUrl
        ) {
          throw new Error(
            "Square creation and lookup responses disagree."
          )
        }

        return recordVerifiedLink(data)
      }
    })

    return Object.freeze({
      status: "completed",
      verified: recorded.verified === true,
      paymentLinkRecorded: recorded.paymentLinkRecorded === true,
      customerPaymentConfirmed: false,
      safeToRetryCreation: false
    })
  } catch {
    // Including a failed DB recording: outcome remains uncertain.
    // Never issue another creation attempt automatically.
    return Object.freeze({
      status: "reconciliation_required",
      reason: "square_creation_verification_or_recording_failed",
      verified: false,
      paymentLinkRecorded: false,
      safeToRetryCreation: false,
      customerPaymentConfirmed: false
    })
  }
}