import mongoose from "mongoose"

import {
  acquireV3CheckoutLock
} from "./smartShippingV3CheckoutLock.js"

import {
  reserveV3SquareRequest
} from "./smartShippingV3ReserveSquareRequest.js"

// Coordinates checkout lock acquisition and Square request
// reservation in one process.
//
// IMPORTANT:
// - Does NOT create or authorize a Square payment link.
// - Does NOT consume the durable Square creation claim.
// - Does NOT retry reservations.
// - Does NOT release locks automatically after failure.
// - A reserved payment remains reconciliation-required
//   until the trusted execution workflow resolves it.

export const acquireAndReserveV3Checkout = async ({
  orderId
}) => {
  if (
    typeof orderId !== "string" ||
    !/^[a-f0-9]{24}$/.test(orderId) ||
    !mongoose.connection.db ||
    mongoose.connection.db.databaseName !==
      "signavi_shipping_v3_dev"
  ) {
    throw new Error("V3 coordinated reservation rejected.")
  }

  const lock = await acquireV3CheckoutLock(orderId)

  if (
    !lock?.owner ||
    !(lock.expiresAt instanceof Date) ||
    lock.expiresAt <= new Date()
  ) {
    throw new Error("V3 checkout lock unavailable.")
  }

  // Reservation is performed immediately under the
  // acquired owner identity. Never start Square here.
  const reservation = await reserveV3SquareRequest({
    orderId,
    owner: lock.owner
  })

  if (
    reservation?.requestReserved !== true ||
    reservation.owner !== lock.owner ||
    reservation.orderId !== orderId ||
    reservation.squareRequestAuthorized !== false ||
    reservation.paymentCreated !== false
  ) {
    // Fail closed. Never reset the reservation or
    // release its ownership lock automatically.
    throw new Error("V3 coordinated reservation invalid.")
  }

  if (lock.expiresAt <= new Date()) {
    throw new Error("V3 coordinated reservation lock expired.")
  }

  return Object.freeze({
    orderId,
    owner: lock.owner,
    expiresAt: lock.expiresAt,
    amountCents: reservation.amountCents,
    checkoutReferenceId: reservation.checkoutReferenceId,
    idempotencyKey: reservation.idempotencyKey,
    requestReserved: true,
    squareRequestAuthorized: false,
    paymentCreated: false
  })
}