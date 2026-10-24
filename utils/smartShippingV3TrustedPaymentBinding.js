import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  createV3CheckoutReference
} from "./smartShippingV3CheckoutReference.js"

// Read-only V3 consistency inspection.
//
// This does not establish a complete trusted checkout
// association and must not authorize Square requests,
// payment retries, lock releases, or database updates.

export const inspectV3TrustedPaymentBinding = async ({
  orderId
}) => {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new Error("Invalid V3 trusted binding order ID.")
  }

  const id = new mongoose.Types.ObjectId(String(orderId))

  const [order, operation] = await Promise.all([
    Order.findById(id).lean(),
    PaymentOperation.findOne({ orderId: id }).lean()
  ])

  const result = (classification, extra = {}) => ({
    orderId: String(id),
    classification,
    squareLookupAuthorized: false,
    ...extra
  })

  if (!order || !operation) {
    return result("missing_trusted_records", {
      orderPresent: Boolean(order),
      operationPresent: Boolean(operation)
    })
  }

  if (
    String(order._id) !== String(operation.orderId)
  ) {
    return result("order_identity_mismatch")
  }

  if (
    operation.environment !== "sandbox" ||
    order.squareEnvironment !== "sandbox"
  ) {
    return result("sandbox_environment_not_bound")
  }

  if (String(order.currency || "").toUpperCase() !== "USD") {
    return result("currency_mismatch")
  }

  if (
    order.paymentStatus === "paid" ||
    !["payment_required", "pending"].includes(order.status)
  ) {
    return result("order_not_awaiting_payment")
  }

  if (
    !Number.isSafeInteger(operation.amountCents) ||
    operation.amountCents <= 0 ||
    !Number.isSafeInteger(order.squareExpectedAmountCents) ||
    order.squareExpectedAmountCents !== operation.amountCents
  ) {
    return result("payment_amount_mismatch")
  }

  if (
    typeof operation.idempotencyKey !== "string" ||
    !operation.idempotencyKey.startsWith("signavi-v3-sandbox-")
  ) {
    return result("invalid_payment_operation_key")
  }

  if (
    !["reconciliation_required", "completed"]
      .includes(operation.status)
  ) {
    return result("payment_request_not_started")
  }

  if (
    typeof operation.requestOwner !== "string" ||
    !operation.requestOwner.trim()
  ) {
    return result("missing_payment_request_owner")
  }

  if (
    typeof operation.squarePaymentLinkId !== "string" ||
    !operation.squarePaymentLinkId.trim()
  ) {
    return result("square_link_id_not_recorded")
  }

  if (
    order.squarePaymentLinkId &&
    order.squarePaymentLinkId !== operation.squarePaymentLinkId
  ) {
    return result("square_link_identity_mismatch")
  }

  if (
    order.squareOrderId &&
    operation.squareOrderId &&
    order.squareOrderId !== operation.squareOrderId
  ) {
    return result("square_order_identity_mismatch")
  }

  if (!operation.checkoutReferenceId) {
    return result("checkout_reference_binding_required")
  }

  const canonicalReference = createV3CheckoutReference({
    orderId: id
  })

  if (operation.checkoutReferenceId !== canonicalReference) {
    return result("checkout_reference_mismatch")
  }

  // The canonical reference matches the persisted order ID.
  // This is still not sufficient to authorize Square lookup:
  // merchant/location ownership and checkout validity remain
  // separate required checks.
  return result("square_merchant_binding_required", {
    recordsConsistent: true,
    checkoutReferenceVerified: true,
    amountCents: operation.amountCents,
    environment: "sandbox"
  })
}