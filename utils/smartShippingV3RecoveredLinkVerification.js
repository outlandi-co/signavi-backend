import {
  lookupV3SquarePaymentLink
} from "./smartShippingV3SquareLookup.js"

import {
  assessV3RecoveredLinkEligibility
} from "./smartShippingV3RecoveredLinkEligibility.js"

// Read-only verification. The caller must obtain order and
// operation from trusted persistence, and location from trusted
// merchant configuration. This module does not load those records.
// It never writes to MongoDB or creates Square payment links.
export const verifyV3RecoveredLinkCandidate = async ({
  client,
  order,
  operation,
  expectedPaymentLinkId,
  expectedLocationId
}) => {
  if (
    !client?.checkout?.paymentLinks?.get ||
    !client?.orders?.get ||
    !order?._id ||
    !operation?.orderId ||
    String(order._id) !== String(operation.orderId) ||
    order.squareEnvironment !== "sandbox" ||
    operation.environment !== "sandbox" ||
    String(order.currency ?? "").toUpperCase() !== "USD" ||
    order.paymentStatus === "paid" ||
    !["payment_required", "pending"].includes(order.status) ||
    operation.status !== "reconciliation_required" ||
    !(operation.squareCreationAttemptClaimedAt instanceof Date) ||
    !Number.isFinite(
      operation.squareCreationAttemptClaimedAt.getTime()
    ) ||
    typeof operation.requestOwner !== "string" ||
    !operation.requestOwner.trim() ||
    typeof operation.idempotencyKey !== "string" ||
    !operation.idempotencyKey.startsWith("signavi-v3-sandbox-") ||
    typeof operation.checkoutReferenceId !== "string" ||
    !operation.checkoutReferenceId.trim() ||
    !Number.isSafeInteger(operation.amountCents) ||
    operation.amountCents <= 0 ||
    order.squareExpectedAmountCents !== operation.amountCents ||
    (order.squarePaymentLinkId ?? "") !== "" ||
    (order.squareOrderId ?? "") !== "" ||
    (operation.squarePaymentLinkId ?? "") !== "" ||
    (operation.squareOrderId ?? "") !== "" ||
    (operation.paymentUrl ?? "") !== "" ||
    typeof expectedPaymentLinkId !== "string" ||
    !expectedPaymentLinkId.trim() ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim()
  ) {
    throw new Error("V3 recovery preverification rejected.")
  }

  const verified = await lookupV3SquarePaymentLink({
    client,
    expectedPaymentLinkId,
    expectedAmountCents: operation.amountCents,
    expectedReferenceId: operation.checkoutReferenceId,
    expectedLocationId
  })

  const assessment = assessV3RecoveredLinkEligibility({
    order,
    operation,
    verified,
    expectedPaymentLinkId
  })

  if (!assessment.eligible) {
    throw new Error("V3 recovered Square association rejected.")
  }

  return Object.freeze({
    eligibleForFurtherReview: true,
    databaseWriteAuthorized: false,
    squareCreationAuthorized: false,
    claimResetAuthorized: false,
    customerPaymentConfirmed: false,
    paymentLinkRecorded: false,
    verified
  })
}