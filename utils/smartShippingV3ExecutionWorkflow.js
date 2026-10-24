import {
  executeV3GuardedSandboxCreation
} from "./smartShippingV3GuardedSDKExecution.js"

import {
  processV3SquareCreationResponse
} from "./smartShippingV3CreationRecording.js"

// Coordinates existing verified components.
//
// Dependencies must be supplied by trusted server wiring.
// The SDK instance used for verification and creation must
// also supply the read-only lookup interface.
//
// No retries. No Square calls inside MongoDB transactions.

export const runV3SandboxExecutionWorkflow = async ({
  orderId,
  owner,
  sdk,
  claimAttempt,
  recordVerifiedLink
}) => {
  if (
    !sdk?.merchantId ||
    !sdk?.locationId ||
    typeof sdk.verifyIdentity !== "function" ||
    typeof sdk.createPaymentLink !== "function" ||
    !sdk.lookupClient ||
    typeof claimAttempt !== "function" ||
    typeof recordVerifiedLink !== "function"
  ) {
    throw new Error("Invalid V3 execution workflow dependencies.")
  }

  let trustedClaim

  const outcome = await executeV3GuardedSandboxCreation({
    orderId,
    owner,
    expectedMerchantId: sdk.merchantId,
    expectedLocationId: sdk.locationId,
    verifyIdentity: sdk.verifyIdentity,
    claimAttempt: async () => {
      trustedClaim = await claimAttempt()
      return trustedClaim
    },
    createPaymentLink: sdk.createPaymentLink
  })

  if (outcome.status !== "lookup_required") {
    return Object.freeze({
      ...outcome,
      paymentLinkRecorded: false,
      customerPaymentConfirmed: false
    })
  }

  // The guarded executor has already classified the
  // returned Square identifiers. Square lookup remains
  // mandatory before MongoDB completion.
  return processV3SquareCreationResponse({
    response: {
      paymentLink: {
        id: outcome.squarePaymentLinkId,
        orderId: outcome.squareOrderId,
        url: outcome.paymentUrl
      }
    },
    client: sdk.lookupClient,
    expectedAmountCents: trustedClaim.amountCents,
    expectedReferenceId: trustedClaim.checkoutReferenceId,
    expectedLocationId: sdk.locationId,
    recordVerifiedLink
  })
}