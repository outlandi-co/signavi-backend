import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

// Read-only recovery assessment.
//
// An expired lock is NOT proof that a Square request
// did not start.
//
// This function NEVER releases a lock, changes an
// operation, or authorizes a Square request.

export const assessV3CheckoutRecovery = async ({
  orderId,
  now = new Date()
}) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("Invalid V3 recovery order ID.")
  }

  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime())
  ) {
    throw new Error("Invalid V3 recovery assessment time.")
  }

  if (
    !["development", "test"].includes(
      String(process.env.NODE_ENV || "").toLowerCase()
    ) ||
    String(process.env.SQUARE_ENVIRONMENT || "")
      .toLowerCase() !== "sandbox"
  ) {
    throw new Error(
      "V3 recovery assessment requires development Sandbox."
    )
  }

  const id = new mongoose.Types.ObjectId(
    String(orderId)
  )

  const [lock, operation] = await Promise.all([
    mongoose.connection
      .collection("smart_shipping_v3_checkout_locks")
      .findOne({ _id: id }),

    PaymentOperation.findOne({
      orderId: id
    }).lean()
  ])

  const result = (reason, candidate = false) =>
    Object.freeze({
      orderId: String(id),
      reason,
      recoveryCandidate: candidate,
      lockReleaseAuthorized: false,
      squareRequestAuthorized: false
    })

  if (!lock) {
    return result(
      operation
        ? "missing_lock_requires_review"
        : "no_preparation"
    )
  }

  if (!operation) {
    return result("missing_operation_requires_review")
  }

  if (
    operation.environment !== "sandbox" ||
    operation.status !== "pending" ||
    operation.requestOwner !== "" ||
    operation.squarePaymentLinkId !== "" ||
    operation.squareOrderId !== "" ||
    operation.paymentUrl !== ""
  ) {
    return result("payment_state_requires_reconciliation")
  }

  if (
    typeof lock.owner !== "string" ||
    !lock.owner.trim() ||
    !(lock.expiresAt instanceof Date) ||
    !Number.isFinite(lock.expiresAt.getTime())
  ) {
    return result("invalid_lock_requires_review")
  }

  if (lock.expiresAt > now) {
    return result("active_preparation")
  }

  // Only identifies a candidate.
  //
  // A separate owned transaction must recheck
  // authoritative state at the moment of release.
  return result("expired_unstarted_candidate", true)
}