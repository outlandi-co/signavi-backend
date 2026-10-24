import mongoose from "mongoose"

import {
  createV3SandboxIdentityReader
} from "./smartShippingV3SandboxIdentityReader.js"

import {
  reserveV3SquareRequest
} from "./smartShippingV3ReserveSquareRequest.js"

// V3 Sandbox preparation only.
//
// Identity retrieval happens BEFORE the MongoDB transaction.
// The transaction must never contain a Square API request.
//
// No payment-link creation or payment authorization here.
// Production V2 is not used or modified.

export const reserveV3VerifiedSandboxRequest = async ({
  orderId,
  owner
}) => {
  if (
    !["development", "test"].includes(process.env.NODE_ENV) ||
    process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
    process.env.SMART_SHIPPING_V3_ENABLED !== "true"
  ) {
    throw new Error("V3 Sandbox reservation is disabled.")
  }

  if (
    !mongoose.isValidObjectId(orderId) ||
    typeof owner !== "string" ||
    !owner.trim()
  ) {
    throw new Error("Invalid V3 reservation identity.")
  }

  // These values come exclusively from server configuration.
  // Never accept credentials, merchant IDs or location IDs
  // from checkout requests.
  const token =
    process.env.SQUARE_SANDBOX_ACCESS_TOKEN

  const expectedMerchantId =
    process.env.SQUARE_SANDBOX_MERCHANT_ID

  const expectedLocationId =
    process.env.SQUARE_SANDBOX_LOCATION_ID

  const reader = createV3SandboxIdentityReader({
    environment: "sandbox",
    token,
    expectedMerchantId,
    expectedLocationId
  })

  return coordinateV3VerifiedSandboxReservation({
    verifyIdentity: () => reader.verifyIdentity(),
    reserve: () => reserveV3SquareRequest({ orderId, owner }),
    expectedMerchantId,
    expectedLocationId
  })
}

// Pure orchestration seam for offline tests.
// Does not grant permission to call Square. The production
// entry point above owns configuration and environment checks.
export const coordinateV3VerifiedSandboxReservation = async ({
  verifyIdentity,
  reserve,
  expectedMerchantId,
  expectedLocationId
}) => {
  if (
    typeof verifyIdentity !== "function" ||
    typeof reserve !== "function" ||
    !expectedMerchantId ||
    !expectedLocationId
  ) {
    throw new Error("Invalid Sandbox coordination dependencies.")
  }

  // External read-only identity check happens first.
  const identity = await verifyIdentity()

  if (
    identity?.verified !== true ||
    identity.squareRequestAuthorized !== false ||
    identity.merchantId !== expectedMerchantId ||
    identity.locationId !== expectedLocationId
  ) {
    throw new Error(
      "V3 Sandbox merchant/location verification failed."
    )
  }

  // This caller invokes the existing atomic DB reservation.
  // No external network operation belongs in that transaction.
  const reservation = await reserve()

  if (
    reservation?.requestReserved !== true ||
    reservation.squareRequestAuthorized !== false ||
    reservation.paymentCreated !== false ||
    reservation.status !== "reconciliation_required" ||
    reservation.environment !== "sandbox"
  ) {
    throw new Error("V3 Sandbox reservation result rejected.")
  }

  return Object.freeze({
    ...reservation,
    merchantIdentityVerified: true,
    merchantId: identity.merchantId,
    locationId: identity.locationId,
    squareRequestAuthorized: false,
    paymentCreated: false
  })
}