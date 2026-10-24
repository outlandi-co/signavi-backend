import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

// Read-only diagnostic inspection.
// Never use this snapshot alone to authorize Square calls,
// release locks, or modify payment state.

export const inspectV3PaymentReconciliation = async ({
  orderId
}) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("Invalid V3 reconciliation order ID.")
  }

  const id = new mongoose.Types.ObjectId(String(orderId))

  const [operation, lock] = await Promise.all([
    PaymentOperation.findOne({
      orderId: id
    }).lean(),

    mongoose.connection
      .collection("smart_shipping_v3_checkout_locks")
      .findOne({ _id: id })
  ])

  if (!operation && !lock) {
    return {
      orderId: String(id),
      classification: "not_found",
      requiresSquareLookup: false
    }
  }

  if (!operation || !lock) {
    return {
      orderId: String(id),
      classification: "manual_review_inconsistent_records",
      requiresSquareLookup:
        operation?.status === "reconciliation_required",
      operationStatus: operation?.status ?? null,
      lockPresent: Boolean(lock)
    }
  }

  const base = {
    orderId: String(id),
    operationStatus: operation.status,
    lockPresent: true,
    amountCents: operation.amountCents,
    environment: operation.environment,
    idempotencyKey: operation.idempotencyKey,
    requestOwner: operation.requestOwner || "",
    lockOwnerMatchesRequest:
      Boolean(operation.requestOwner) &&
      lock.owner === operation.requestOwner
  }

  if (operation.environment !== "sandbox") {
    return {
      ...base,
      classification: "manual_review_environment_mismatch",
      requiresSquareLookup: false
    }
  }

  if (operation.status === "pending") {
    if (
      operation.requestOwner ||
      operation.squarePaymentLinkId ||
      operation.squareOrderId ||
      operation.paymentUrl
    ) {
      return {
        ...base,
        classification: "manual_review_inconsistent_pending",
        requiresSquareLookup: true
      }
    }

    return {
      ...base,
      classification: "prepared_not_started",
      requiresSquareLookup: false
    }
  }

  if (operation.status === "reconciliation_required") {
    return {
      ...base,
      classification: "square_lookup_required",
      requiresSquareLookup: true,
      hasRecordedSquareLink:
        Boolean(operation.squarePaymentLinkId)
    }
  }

  if (operation.status === "completed") {
    const linkRecorded = Boolean(
      operation.paymentUrl &&
      operation.squarePaymentLinkId &&
      operation.squareOrderId
    )

    return {
      ...base,
      classification: linkRecorded
        ? "payment_link_recorded"
        : "manual_review_incomplete_payment_link",
      requiresSquareLookup: !linkRecorded
    }
  }

  return {
    ...base,
    classification: "manual_review_unknown_status",
    requiresSquareLookup: true
  }
}