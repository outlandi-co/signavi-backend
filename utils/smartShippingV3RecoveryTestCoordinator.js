import {
  inspectV3RecoveryReadOnly
} from "./smartShippingV3RecoveryReadOnlyCoordinator.js"

import {
  recordV3RecoveredLinkTransaction
} from "./smartShippingV3RecoveredLinkTransaction.js"

// TEST ONLY. This is not a real-order recovery authorization.
// The real recording primitive retains its independent database,
// environment, and protected-order guards.

export const coordinateV3RecoveryTestOnly = async ({
  orderId,
  owner,
  expectedPaymentLinkId,
  inspectionArgs,
  inspect = inspectV3RecoveryReadOnly,
  record = recordV3RecoveredLinkTransaction
}) => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("V3 recovery coordination is test-only.")
  }

  if (
    typeof owner !== "string" ||
    !owner.trim() ||
    typeof expectedPaymentLinkId !== "string" ||
    !expectedPaymentLinkId.trim() ||
    typeof orderId !== "string" ||
    !/^[a-f0-9]{24}$/i.test(orderId) ||
    !inspectionArgs ||
    inspectionArgs.orderId !== orderId ||
    inspectionArgs.expectedPaymentLinkId !== expectedPaymentLinkId ||
    typeof inspect !== "function" ||
    typeof record !== "function"
  ) {
    throw new Error("Invalid V3 test coordination inputs.")
  }

  if ([
    "6addc6f674d8362634569095",
    "6ae10e8c9a2fa3d170f56486"
  ].includes(orderId.toLowerCase())) {
    throw new Error("Protected original order rejected.")
  }

  // Must finish Square inspection before starting MongoDB recording.
  // No external API call may occur inside the recording transaction.
  const inspection = await inspect(inspectionArgs)

  if (
    inspection?.eligibleForFurtherReview !== true ||
    inspection.databaseWriteAuthorized !== false ||
    inspection.squareCreationAuthorized !== false ||
    inspection.claimResetAuthorized !== false ||
    inspection.customerPaymentConfirmed !== false ||
    inspection.paymentLinkRecorded !== false ||
    inspection.verified?.verified !== true ||
    inspection.verified?.checkoutReferenceVerified !== true ||
    inspection.verified?.squarePaymentLinkId !== expectedPaymentLinkId
  ) {
    throw new Error("V3 recovered-link inspection rejected.")
  }

  const result = await record({
    orderId,
    owner,
    expectedPaymentLinkId,
    verified: inspection.verified
  })

  if (
    result?.recorded !== true ||
    result.paymentLinkRecorded !== true ||
    result.customerPaymentConfirmed !== false ||
    result.squareCreationAuthorized !== false ||
    result.claimResetAuthorized !== false
  ) {
    throw new Error("V3 recovered-link recording rejected.")
  }

  return Object.freeze({
    recorded: true,
    paymentLinkRecorded: true,
    customerPaymentConfirmed: false,
    squareCreationAuthorized: false,
    claimResetAuthorized: false
  })
}