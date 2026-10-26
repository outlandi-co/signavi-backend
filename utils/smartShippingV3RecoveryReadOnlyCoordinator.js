import mongoose from "mongoose"

import {
  classifyV3CheckoutReference
} from "./smartShippingV3ReferenceIdentity.js"

import {
  verifyV3RecoveredLinkCandidate
} from "./smartShippingV3RecoveredLinkVerification.js"

// OFFLINE COMPOSITION BOUNDARY.
// Dependencies must be supplied by a separately audited server-side
// adapter. This module does not establish their provenance itself.
// No database write, creation request, or claim reset is available.
export const inspectV3RecoveryReadOnly = async ({
  orderId,
  expectedPaymentLinkId,
  loadTrustedRecords,
  verifyTrustedIdentity,
  lookupClient,
  expectedMerchantId,
  expectedLocationId
}) => {
  if (
    !mongoose.isObjectIdOrHexString(orderId) ||
    typeof expectedPaymentLinkId !== "string" ||
    !expectedPaymentLinkId.trim() ||
    typeof loadTrustedRecords !== "function" ||
    typeof verifyTrustedIdentity !== "function" ||
    typeof lookupClient?.checkout?.paymentLinks?.get !== "function" ||
    typeof lookupClient?.orders?.get !== "function" ||
    typeof expectedMerchantId !== "string" ||
    !expectedMerchantId.trim() ||
    typeof expectedLocationId !== "string" ||
    !expectedLocationId.trim()
  ) {
    throw new Error("V3 recovery coordinator configuration rejected.")
  }

  const records = await loadTrustedRecords(orderId)

  const order = records?.order
  const operation = records?.operation

  if (
    !order ||
    !operation ||
    String(order._id) !== String(orderId) ||
    String(operation.orderId) !== String(orderId) ||
    operation.status !== "reconciliation_required" ||
    operation.environment !== "sandbox" ||
    order.squareEnvironment !== "sandbox" ||
    order.paymentStatus === "paid" ||
    !["payment_required", "pending"].includes(order.status) ||
    classifyV3CheckoutReference({
      orderId,
      referenceId: operation.checkoutReferenceId
    }) !== "square_safe"
  ) {
    throw new Error("V3 trusted recovery records rejected.")
  }

  const identity = await verifyTrustedIdentity()

  if (
    identity?.verified !== true ||
    identity.merchantId !== expectedMerchantId ||
    identity.locationId !== expectedLocationId ||
    identity.currency !== "USD"
  ) {
    throw new Error("V3 Sandbox merchant identity rejected.")
  }

  const association = await verifyV3RecoveredLinkCandidate({
    client: lookupClient,
    order,
    operation,
    expectedPaymentLinkId,
    expectedLocationId
  })

  if (
    association.eligibleForFurtherReview !== true ||
    association.databaseWriteAuthorized !== false ||
    association.squareCreationAuthorized !== false ||
    association.claimResetAuthorized !== false ||
    association.customerPaymentConfirmed !== false ||
    association.paymentLinkRecorded !== false
  ) {
    throw new Error("V3 recovery read-only boundary rejected.")
  }

  return Object.freeze({
    eligibleForFurtherReview: true,
    databaseWriteAuthorized: false,
    squareCreationAuthorized: false,
    claimResetAuthorized: false,
    customerPaymentConfirmed: false,
    paymentLinkRecorded: false,
    verified: association.verified
  })
}