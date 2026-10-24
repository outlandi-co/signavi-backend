import mongoose from "mongoose"

// Pure validation of a previously acquired reservation.
// This does not authorize Square creation or query MongoDB.
export const validateSquarePaymentCreationReservation = ({
  reservation,
  orderId,
  environment,
  amountCents
}) => {
  if (
    !mongoose.isValidObjectId(orderId) ||
    !["sandbox", "production"].includes(environment) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new Error("Invalid payment reservation validation input.")
  }

  if (
    !reservation ||
    reservation.reserved !== true ||
    reservation.squareRequestAuthorized !== false ||
    reservation.paymentCreated !== false ||
    String(reservation.orderId) !== String(orderId) ||
    reservation.environment !== environment ||
    reservation.amountCents !== amountCents ||
    typeof reservation.owner !== "string" ||
    !reservation.owner.trim() ||
    reservation.idempotencyKey !==
      `signavi-${environment}-${String(orderId)}`
  ) {
    return Object.freeze({
      valid: false,
      reason: "reservation_missing_or_inconsistent",
      squareRequestAuthorized: false
    })
  }

  return Object.freeze({
    valid: true,
    orderId: String(orderId),
    environment,
    amountCents,
    squareRequestAuthorized: false
  })
}